const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

const usersFile = './users.json';
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([]));

function saveUser(username) {
  let users = JSON.parse(fs.readFileSync(usersFile));
  if (!users.includes(username)) {
    users.push(username);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  }
}

// Login
app.get('/', (req, res) => {
  if (req.session.username) return res.redirect('/dashboard');
  res.render('login');
});

app.post('/login', (req, res) => {
  const username = req.body.username.trim();
  if (!username) return res.send('Invalid username');
  req.session.username = username;
  saveUser(username);
  res.redirect('/dashboard');
});

// Dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.username) return res.redirect('/');
  res.render('dashboard', { username: req.session.username });
});

// Admin Dashboard
app.get('/admin', (req, res) => {
  const users = JSON.parse(fs.readFileSync(usersFile));
  res.render('admin', { users });
});

// Start Bot
const usedPorts = new Set(); // You could persist this with a file or database

function getAvailablePort(start = 4000) {
  let port = start;
  while (usedPorts.has(port)) port++;
  usedPorts.add(port);
  return port;
}

app.post('/start', (req, res) => {
  const { BOT_NAME, SESSION_ID, SUDO } = req.body;
  const username = req.session.username;
  const userPath = path.join(__dirname, 'users', username);
  const botPath = path.join(userPath, 'izumi-bot');

  if (!fs.existsSync(botPath)) {
    fs.mkdirSync(userPath, { recursive: true });
    fs.cpSync(path.join(__dirname, 'shared', 'izumi-bot'), botPath, { recursive: true });
  }

  // 🔁 Dynamically assign a port
  const PORT = getAvailablePort(4000);

  // ✏️ Write config.env
  const config = `BOT_NAME=${BOT_NAME}\nSESSION_ID=${SESSION_ID}\nSUDO=${SUDO}\nPORT=${PORT}\n`;
  fs.writeFileSync(path.join(botPath, 'config.env'), config);

  // 🪵 Log file
  const logFile = path.join(botPath, 'bot.log');
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');

  // 🚀 Start bot
  exec(`cd ${botPath} && npm start >> bot.log 2>&1 &`);

  res.send(`Bot started on port ${PORT}. <a href="/logs/${username}">View Logs</a>`);
});

// Live logs
app.get('/logs/:user', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

io.on('connection', socket => {
  socket.on('join-log', username => {
    const logFile = path.join(__dirname, 'users', username, 'izumi-bot', 'bot.log');
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '');
    }

    const stream = fs.createReadStream(logFile, { encoding: 'utf8', start: 0 });
    stream.on('data', chunk => socket.emit('log', chunk));

    const watcher = fs.watch(logFile, () => {
      const data = fs.readFileSync(logFile, 'utf8');
      socket.emit('log', data);
    });

    socket.on('disconnect', () => watcher.close());
  });
});

http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

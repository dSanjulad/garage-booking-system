const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // animation libraries set inline styles
      imgSrc: ["'self'", 'data:'],
      formAction: ["'self'", 'https://sandbox.payhere.lk', 'https://www.payhere.lk'],
      upgradeInsecureRequests: null // the evaluation instance may run on plain HTTP
    }
  }
}));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use('/api', notFoundHandler);

// Single-instance deployment: serve the built frontend from the same server.
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

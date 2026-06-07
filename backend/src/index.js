const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const app = express();
const PORT = process.env.PORT || 19109;
app.use(cors());
app.use(express.json());
initDb();
app.use('/api/auth', require('./routes/auth'));
app.use('/api/requirements', require('./routes/requirements'));
app.use('/api/inquiries', require('./routes/inquiries'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/awards', require('./routes/awards'));
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', message: 'OK' });
});
app.use(function(err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});

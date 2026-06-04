const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.ACCESS_SECRET || 'drive_access_secret_key_2024';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'drive_refresh_secret_key_2024';

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    ACCESS_SECRET,
    { expiresIn: '1h' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};

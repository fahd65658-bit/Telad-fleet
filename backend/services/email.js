'use strict';

const logger = require('../utils/logger');

let transporter = null;

function init() {
  if (!process.env.SMTP_HOST) {
    logger.warn('SMTP_HOST not set — email service disabled');
    return;
  }
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    logger.info('Email service initialized');
  } catch (err) {
    logger.warn('nodemailer unavailable — email disabled:', err.message);
  }
}

async function sendEmail(to, subject, html) {
  if (!transporter) {
    logger.warn('Email not sent (service disabled):', subject);
    return false;
  }
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    logger.error('Failed to send email:', err.message);
    return false;
  }
}

module.exports = { init, sendEmail };

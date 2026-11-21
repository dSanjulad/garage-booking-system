const express = require('express');
const slotController = require('../controllers/slotController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.delete('/:id', authenticate, authorize('operator', 'admin'), slotController.remove);

module.exports = router;

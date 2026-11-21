const express = require('express');
const serviceController = require('../controllers/serviceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.put('/:id', authenticate, authorize('operator', 'admin'), serviceController.update);
router.delete('/:id', authenticate, authorize('operator', 'admin'), serviceController.remove);

module.exports = router;

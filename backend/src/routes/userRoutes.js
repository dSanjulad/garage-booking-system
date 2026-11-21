const express = require('express');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), userController.listAll);
router.patch('/:id/role', authenticate, authorize('admin'), userController.updateRole);

module.exports = router;

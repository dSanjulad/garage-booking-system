const express = require('express');
const garageController = require('../controllers/garageController');
const serviceController = require('../controllers/serviceController');
const slotController = require('../controllers/slotController');
const reviewController = require('../controllers/reviewController');
const { authenticate, authorize, attachUserIfPresent } = require('../middleware/auth');

const router = express.Router();
const operator = [authenticate, authorize('operator', 'admin')];

// --- Garage search / CRUD ---
router.get('/', attachUserIfPresent, garageController.search);
router.get('/mine', operator, garageController.getMine);
router.get('/:id', garageController.getById);
router.get('/:id/stats', operator, garageController.stats);
router.post('/', operator, garageController.create);
router.put('/:id', operator, garageController.update);
router.delete('/:id', operator, garageController.remove);

// --- Nested: services offered by a garage ---
router.get('/:garageId/services', serviceController.listForGarage);
router.get('/:garageId/services/all', operator, serviceController.listAllForGarage);
router.post('/:garageId/services', operator, serviceController.create);

// --- Nested: real-time slot availability for a garage ---
router.get('/:garageId/slots', slotController.listForGarageAndDate);
router.get('/:garageId/availability', slotController.availability);
router.post('/:garageId/slots/generate', operator, slotController.generate);

// --- Nested: reviews for a garage ---
router.get('/:garageId/reviews', reviewController.listForGarage);

module.exports = router;

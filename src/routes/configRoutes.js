const express = require('express');
const configController = require('../controllers/configController');
const { protectAdmin, hasPermission } = require('../middlewares/authMiddleware');

const router = express.Router();

// All config routes require admin access
router.use(protectAdmin);

router.get('/', hasPermission('settings'), configController.getSystemConfig);

// Protect update route
router.patch('/', hasPermission('settings'), configController.updateSystemConfig);

module.exports = router;

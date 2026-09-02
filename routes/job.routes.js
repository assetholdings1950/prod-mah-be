const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.midleware');
const requireRole = require('../middleware/role.middleware');
const { commonErrors } = require('../errors/error');
const {
    getActiveJobsController,
    getActiveJobController,
    getAllJobsController,
    createJobController,
    updateJobController,
    deleteJobController
} = require('../controller/job.controller');

// GET active jobs (public)
router.get(['/', '/list'], getActiveJobsController);

// GET all jobs (admin)
router.get(
    ['/admin', '/admin/list'],
    authenticate,
    requireRole(['Super-Admin', 'Admin', 'Hiring Admin']),
    getAllJobsController
);

// Public SEO-friendly detail route; accepts either the ObjectId or a slug ending in it.
router.get('/:id', getActiveJobController);

// CREATE a job (admin)
router.post(
    ['/', '/create'],
    authenticate,
    requireRole(['Super-Admin', 'Admin', 'Hiring Admin']),
    createJobController
);

// UPDATE a job (admin)
router.put(
    ['/:id', '/update/:id', '/update'],
    authenticate,
    requireRole(['Super-Admin', 'Admin', 'Hiring Admin']),
    updateJobController
);

// DELETE a job (admin)
router.delete(
    ['/:id', '/delete/:id', '/delete'],
    authenticate,
    requireRole(['Super-Admin', 'Admin', 'Hiring Admin']),
    deleteJobController
);

router.use(commonErrors);

module.exports = router;

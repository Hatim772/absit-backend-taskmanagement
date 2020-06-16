import { Router } from 'express';
import multer from 'multer';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import ProjectMiddleware from '../middlewares/projectMiddlewares';
import { isAdmin } from '../middlewares/isAdmin';

// controllers
import * as projectController from '../controllers/Projects/projectControlller';

// validation schemas
import { validateSchema, createProject, uploadAProjectFile, getProjectFiles, renameAProjectFile } from '../commonFunction/validationSchema';

const ProjectRouter: Router = Router();
const auth = new AuthHandler();
const upload = multer();

const projectMiddleware = new ProjectMiddleware();

ProjectRouter.post('/createProject', [auth.authenticate(), validateSchema(createProject)], projectController.createProject);

ProjectRouter.get('/getAll', auth.authenticate(), projectController.getAllNames);

ProjectRouter.get('/getProjectWithOrders/:project_id', auth.authenticate(), projectController.getProjectWithOrders);

ProjectRouter.post('/uploadAFile',
    upload.single('project_file'),
    [
        auth.authenticate(),
        projectMiddleware.hasFile,
        validateSchema(uploadAProjectFile),
        projectMiddleware.doesProjectExists
    ],
    projectController.uploadAProjectFile);

ProjectRouter.put('/renameAFile',
    [
        auth.authenticate(),
        validateSchema(renameAProjectFile),
        projectMiddleware.isProjectFileOwner
    ],
projectController.renameAProjectFile);

// admin
ProjectRouter.post('/uploadAFileForAdmin',
    upload.single('project_file'),
    [
        auth.authenticate(),
        isAdmin,
        projectMiddleware.hasFile,
        validateSchema(uploadAProjectFile),
        projectMiddleware.doesProjectExists
    ],
    projectController.adminUploadFile);

ProjectRouter.get('/getAllProjectFiles', auth.authenticate(), projectController.getAllProjectFiles);
ProjectRouter.get('/cancelOrder/:orderId', auth.authenticate(), projectController.cancelOrder);

ProjectRouter.delete('/deleteProjectFile', auth.authenticate(), projectController.deleteProjectFile);

export default ProjectRouter;

// third parties
import { Router } from 'express';
import multer from 'multer';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import { isAdmin } from '../middlewares/isAdmin';
const upload = multer();

//locals 
import {
    validateSchema,
    addProjectManager,
    addOrUpdateBankDetails,
    updateUsersPM,
    changeSampleOrderStatus,
    adminExtendSampleOrder,
    placeAnOrder,
    quoteOrder,
    orderDeliveryStatus,
    sendingPricing,
    adminResponseForMoodboardPublic,
    uploadAOrderProjectFile,
    makeMoodboardTranding
} from '../commonFunction/validationSchema';

// controllers
import UserController from '../controllers/Admin/userController';
import BankController from '../controllers/Admin/bankController';
import UserDetailsController from '../controllers/Users/userDetailsController';
import SampleOrderController from '../controllers/Moodboards/samplesController';
import QuoteController from '../controllers/Quote/quoteContorller';
import BulkUpload from '../controllers/Admin/bulkUpload';
import MoodboardController from '../controllers/Moodboards/moodboardController';
import QuoteMiddleware from '../middlewares/quoteMiddlware';

const auth = new AuthHandler();
const AdminRouter: Router = Router();

const user: UserController = new UserController();
const bank: BankController = new BankController();
const userDetails: UserDetailsController = new UserDetailsController();
const sample: SampleOrderController = new SampleOrderController();
const quote: QuoteController = new QuoteController();
const bulky: BulkUpload = new BulkUpload();
const moodboard: MoodboardController = new MoodboardController();
const quoteMiddleware = new QuoteMiddleware();

// bulk upload
AdminRouter.post('/bulkUploadProducts', [auth.authenticate(), isAdmin], bulky.bulkUploadProducts);
AdminRouter.post('/bulkUploadUsers', [auth.authenticate(), isAdmin], bulky.bulkUploadUsers);

// Project manager
AdminRouter.post('/addProjectManager', [auth.authenticate(), isAdmin, validateSchema(addProjectManager)], user.addProjectManager);
AdminRouter.get('/deleteProjectManager', [auth.authenticate(), isAdmin], user.deleteProjectManager);
AdminRouter.post('/updateUsersPM', [auth.authenticate(), isAdmin, validateSchema(updateUsersPM)], user.updateUsersPM);
AdminRouter.get('/getPMs', [auth.authenticate(), isAdmin], user.getPMs);
AdminRouter.get('/projectManagers', [auth.authenticate(), isAdmin], user.getAllProjectManagers);
AdminRouter.get('/usersWithProjectManagers', [auth.authenticate(), isAdmin], user.listUsersWithProjectManagers);
AdminRouter.get('/getProjectManagerById/:userId', [auth.authenticate(), isAdmin], user.getManagerById);
AdminRouter.put('/updateManagerById/:userId', [auth.authenticate(), isAdmin], user.updateManagerById);

// Users
AdminRouter.get('/users/export', [auth.authenticate(), isAdmin], userDetails.getExportUsers);
AdminRouter.get('/user/:id', [auth.authenticate(), isAdmin], userDetails.getUser);
AdminRouter.post('/verifyUser/:id', [auth.authenticate(), isAdmin], userDetails.verifyUser);
AdminRouter.get('/getUsersForVerification', [auth.authenticate(), isAdmin], userDetails.getUnVerifiedUsers);
AdminRouter.post('/changeUserStatus/:userId', [auth.authenticate(), isAdmin], userDetails.changeUsersStatus);

// AQSit Bank details
AdminRouter.post('/addOrUpdateBankDetails', [auth.authenticate(), isAdmin, validateSchema(addOrUpdateBankDetails)], bank.addOrUpdateBankDetails);

// Sample ordering
AdminRouter.get('/getAllSampleOrders', [auth.authenticate(), isAdmin], sample.showAllSampleOrders);
AdminRouter.get('/getSampleOrder/:id', [auth.authenticate(), isAdmin], sample.getSampleOrder);
AdminRouter.put('/changeSampleOrderSStatus', [auth.authenticate(), validateSchema(changeSampleOrderStatus)], sample.changeSampleOrderSStatus);
AdminRouter.get('/listRequests', [auth.authenticate(), isAdmin], sample.listRequests);
AdminRouter.put('/extendSampleOrderSDate', [auth.authenticate(), isAdmin, validateSchema(adminExtendSampleOrder)], sample.extendSampleOrderReturnDate);
AdminRouter.get('/getCsvMoodboardOrders', auth.authenticate(), isAdmin, moodboard.getCsvRecordOfMoodboardOrders);

// Product pricing
AdminRouter.get('/getAllPricings', auth.authenticate(), isAdmin, quote.getAllPricing);
AdminRouter.post('/sendPricing', [auth.authenticate(), isAdmin, validateSchema(sendingPricing)], quote.sendPricing);

// Order(quotation)
AdminRouter.get('/getOrders', auth.authenticate(), isAdmin, quote.getOrders); // get all order(quote) as per status(1/2/3/4)
AdminRouter.post('/quoteOrder', [auth.authenticate(), isAdmin, validateSchema(quoteOrder)], quote.quoteOrder); // set amount and status order(quote)
AdminRouter.post('/setorderDeliveryStatus', [auth.authenticate(), isAdmin, validateSchema(orderDeliveryStatus)], quote.setorderDeliveryStatus); // set amount and status order(quote)
AdminRouter.get('/setOrderDelivered/:id', [auth.authenticate(), isAdmin], quote.setorderDelivered); // set status order delivered(quote)
AdminRouter.get('/getOrderDetails/:id', auth.authenticate(), isAdmin, quote.getOrderDetails); // get order(quote) details
AdminRouter.post('/addTransactionId', [auth.authenticate(), isAdmin, validateSchema(placeAnOrder)], quote.addTransactionId);
// admin
AdminRouter.post('/uploadAFileOfProjectForAdmin',
    upload.single('project_file'),
    [
        auth.authenticate(),
        isAdmin,
        quoteMiddleware.hasFile,
        validateSchema(uploadAOrderProjectFile),
        quoteMiddleware.doesProjectExists
    ],
    quote.adminUploadFile);
AdminRouter.delete('/deleteAFileOfProjectForAdmin/:id', [auth.authenticate(), isAdmin], quote.adminDeleteFile);



AdminRouter.get('/getCsvQuotation', auth.authenticate(), isAdmin, quote.getCsvQuotation);
AdminRouter.get('/getCsvOrder', auth.authenticate(), isAdmin, quote.getCsvOrder);
// Moodboard
AdminRouter.get('/getAllMoodboards', [auth.authenticate(), isAdmin], moodboard.getAllMoodboards);

// get all moodboard whose needed to be public
AdminRouter.get('/getAllRequestedForPublic', auth.authenticate(), isAdmin, moodboard.getAllRequestedForPublic);
AdminRouter.get('/getAllTrendingMoodboards', auth.authenticate(), moodboard.getAllTrendingMoodboard);
AdminRouter.get('/getAllPublicMoodboard', [auth.authenticate(), isAdmin], moodboard.getAllPublicMoodboard);
AdminRouter.put('/makeMoodboardPublic', [auth.authenticate(), isAdmin, validateSchema(adminResponseForMoodboardPublic)], moodboard.makeMoodboardPublic);
AdminRouter.put('/makeMoodboardTrending/:moodboard_id', [auth.authenticate(), isAdmin, validateSchema(makeMoodboardTranding)], moodboard.makeMoodboardTrending);
AdminRouter.get('/getMoodboardDetail/:moodboard_id', auth.authenticate(), isAdmin, moodboard.getMoodboardDetail);
export default AdminRouter;
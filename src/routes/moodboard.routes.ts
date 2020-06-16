import { Router } from 'express';
import multer from 'multer';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import { isAdmin } from '../middlewares/isAdmin';
import MoodboardMiddleware from '../middlewares/moodboardMiddleware';

// controller
import MoodboardController from '../controllers/Moodboards/moodboardController';
import SampleOrderController from '../controllers/Moodboards/samplesController';

// validation schemas
import {
    validateSchema,
    moodboardMakeSampleOrder,
    moodboardAdd,
    moodboardRename,
    moodboardAddColor,
    moodboardProductAdd,
    moodboardDeleteOrDeleteOrApprove,
    moodboardFavouriteProduct,
    changeSampleOrderStatus,
    moodboardCreateLabel,
    moodboardAddLabelToProducts,
    moodboardRenameLabel,
    moodboardDeleteLabel,
    requestForMoodboardPublic,
    moodboardDeleteItems,
    getAllPublicOrPrivateMoodboard,
    setUserSAddressForSampling,
    extendSampleOrder,
    getAllPublic,
    uploadMoodboardImage
} from '../commonFunction/validationSchema';

const MoodboardRouter: Router = Router();
const auth = new AuthHandler();
const uploads = multer();
const moodboard: MoodboardController = new MoodboardController();
const sample: SampleOrderController = new SampleOrderController();
const moodboardMiddleware = new MoodboardMiddleware();

/**
 * Public routes
 */
// get someone's moodboard by it's id
MoodboardRouter.get('/getMoodboardById/:moodboard_id', moodboard.getById);
// get moodboard tags
MoodboardRouter.get('/getMoodboardTags/:tag', moodboard.getMoodboardTags);
// get moodboards by tag
MoodboardRouter.post('/getMoodboardsByTag', validateSchema(getAllPublicOrPrivateMoodboard), moodboard.findMoodboardByTag);
// get all public moodboards
MoodboardRouter.post('/getAllPublic', validateSchema(getAllPublic), moodboard.listPublicMoodboards);
// show someone's all public moodboards
MoodboardRouter.get('/getUserSMoodboards/:user_id', moodboard.getUserSMoodboards);
// get all public moodboards
MoodboardRouter.get('/listView', moodboard.getByListView);
//search users and moodboard
MoodboardRouter.get('/listViewSearch', moodboard.searchListView);
// main search
MoodboardRouter.get('/searchProductOrMoodboard', moodboard.mainSearch);
// main search get by tags
MoodboardRouter.get('/getByTags', moodboard.getByTags);
//Get Trending moodboards
MoodboardRouter.get('/getTrendingMoodboards', moodboard.getTrendingMoodboards);

/**
 * Private routes
 */
// create moodboard
MoodboardRouter.post('/create', [auth.authenticate(), validateSchema(moodboardAdd)], moodboard.createMoodboard);
// adding items
MoodboardRouter.post('/addImageToMoodboard', uploads.single('moodboard_image'), [auth.authenticate(), validateSchema(uploadMoodboardImage)], moodboard.addImageToMoodboard);
MoodboardRouter.post('/addColorToMoodboard', [auth.authenticate(), validateSchema(moodboardAddColor)], moodboard.addColorToMoodboard);
MoodboardRouter.post('/addProductToMoodboard', [auth.authenticate(), validateSchema(moodboardProductAdd)], moodboard.addProductToMoodboard);
// deleting items
MoodboardRouter.delete('/removeMoodboardItems', [auth.authenticate(), validateSchema(moodboardDeleteItems), moodboardMiddleware.isMoodboardOwner], moodboard.removeMoodboardItem);
// favourting the products
MoodboardRouter.post('/favouriteProduct', [auth.authenticate(), validateSchema(moodboardFavouriteProduct), moodboardMiddleware.isMoodboardItemOwner], moodboard.favouriteProduct);
// rename the moodboard
MoodboardRouter.put('/rename', [auth.authenticate(), validateSchema(moodboardRename)], moodboard.renameMoodboard);
// Change moodboard's shareability
MoodboardRouter.post('/requestForMoodboardPublic', [auth.authenticate(), validateSchema(requestForMoodboardPublic)], moodboard.requestForMoodboardPublic);
// Delete moodbaord
MoodboardRouter.delete('/deleteMoodboard', [auth.authenticate(), validateSchema(moodboardDeleteOrDeleteOrApprove)], moodboard.deleteMoodboard);
// get all user's moodboards
MoodboardRouter.get('/getAll', auth.authenticate(), moodboard.getUserSMoodboardsOrCollections);
// get collection
MoodboardRouter.get('/getCollection', auth.authenticate(), moodboard.getUserSMoodboardsOrCollections);
// get moodboard by it's id
MoodboardRouter.get('/getById/:moodboard_id', auth.authenticate(), moodboard.getById);
// get all moodboards with just name and id
MoodboardRouter.get('/getAllMoodboardTitles', auth.authenticate(), moodboard.getAllMoodboardTitles);
// Clone moodbaord
MoodboardRouter.post('/cloneAMoodboard/:moodboard_id', [auth.authenticate(), moodboardMiddleware.isMoodboardOwnerWhileCloning], moodboard.cloneAMoodboard);
// get moodboard tags
MoodboardRouter.get('/getUserSMoodboardTags/:tag', auth.authenticate(), moodboard.getMoodboardTags);
// get moodboards by tag
MoodboardRouter.post('/getUserSMoodboardsByTag', [auth.authenticate(), validateSchema(getAllPublicOrPrivateMoodboard)], moodboard.findMoodboardByTag);

/**
 *  Sample order
 */
// make sample request from moodboard
MoodboardRouter.post('/makeSampleOrder', [auth.authenticate(), validateSchema(moodboardMakeSampleOrder)], sample.makeSampleOrder);
// get order from id
MoodboardRouter.get('/getSampleOrder/:order_id', auth.authenticate(), sample.getById);
// send shipping address with phonenumber and user's information
MoodboardRouter.get('/getUserDetailsForSampling', auth.authenticate(), sample.getSamplingInfo);
// save user details for sample ordering 
MoodboardRouter.post('/setUserDetailsForSampling', [auth.authenticate(), validateSchema(setUserSAddressForSampling)], sample.setSamplingInfo);
// get all orders of user
MoodboardRouter.get('/getAllSampleOrder', auth.authenticate(), sample.getById);
// request for extend the sample order date
MoodboardRouter.post('/requestForExtendSample', [auth.authenticate(), validateSchema(extendSampleOrder), moodboardMiddleware.isSampleOrderAuthenticated], sample.requestForExtendDate);

/**
 * Moodboard internal grouping
 */
// create a label
MoodboardRouter.post('/createALabel', [auth.authenticate(), validateSchema(moodboardCreateLabel)], moodboard.createAlabel);
// add that label to products
MoodboardRouter.put('/attachLabelToProducts', [auth.authenticate(), validateSchema(moodboardAddLabelToProducts)], moodboard.addLabelToProducts);
// get labels moodboards perspective
MoodboardRouter.get('/getLabels/:moodboard_id', auth.authenticate(), moodboard.getLabels);
// rename label
MoodboardRouter.put('/renameLabel', [auth.authenticate(), validateSchema(moodboardRenameLabel)], moodboard.renameLabel);
// delete label
MoodboardRouter.put('/deleteLabel', [auth.authenticate(), validateSchema(moodboardDeleteLabel)], moodboard.deleteLabel);

/**
 * Admin authenticated
 */
// make moodboard public
MoodboardRouter.put('/makeMoodboardPublic', [auth.authenticate(), validateSchema(requestForMoodboardPublic)], moodboard.makeMoodboardPublic);
// get all trending moodboards
MoodboardRouter.get('/getAllTrendingMoodboards', auth.authenticate(), moodboard.getAllTrendingMoodboard);
// make trending moodboard
MoodboardRouter.put('/makeMoodboardTrending/:moodboard_id', auth.authenticate(), moodboard.makeMoodboardTrending);
MoodboardRouter.put('/insertUpdateThubnailImage/:moodboard_id', auth.authenticate(), moodboard.insertUpdateThumbnailImage);


// new location /admin/ routes
// // get all sample orders for admin
// MoodboardRouter.get('/getAllSampleOrders', auth.authenticate(), sampleRouter.showAllSampleOrders);
// // change sample order's status
// MoodboardRouter.put('/changeSampleOrderSStatus', [auth.authenticate(), validateSchema(changeSampleOrderStatus)], sampleRouter.changeStatus);
// // extend sample order's returning date
// MoodboardRouter.put('/extendSampleOrderSDate', [auth.authenticate(), isAdmin, validateSchema(extendSampleOrder)], sampleRouter.extendSampleOrderReturnDate);

export default MoodboardRouter;

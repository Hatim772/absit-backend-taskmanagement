// Third parties
import { Router } from 'express';
import multer from 'multer';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import QuoteMiddlware from '../middlewares/quoteMiddlware';
const uploads = multer();
// controllers
// import QuoteContorller from '../controllers/Quote/quoteContorller';
import taskCommentController from '../controllers/TaskComment/taskcomment.controller';

// validation schemas
import {
    validateSchema,
    createAnOrder,
    deleteProduct,
    requestForPricing,
    addProductsForQuotation,
    addBillingAddress,
    updateShippingAddress,
    placeAnOrder,
    billingSameAsShippingAddress
} from '../commonFunction/validationSchema';
import { isAdmin } from '../middlewares/isAdmin';

const TaskCommentRouter: Router = Router();
const auth = new AuthHandler();
const quoteMiddleware = new QuoteMiddlware();

const taskComment = new taskCommentController();
// const quote = new QuoteContorller();


TaskCommentRouter.post('/taskComment',uploads.single('attachment'), taskComment.create);
TaskCommentRouter.get('/taskComment', taskComment.fetch);
TaskCommentRouter.put('/taskComment', taskComment.update);
// TaskCommentRouter.post('/addProductsCreate', [auth.authenticate(), validateSchema(addProductsForQuotation)], projectCtreate.projectCreateHandler);


// QuoteRouter.post('/addProducts', [auth.authenticate(), validateSchema(addProductsForQuotation)], quote.addProducts);
// QuoteRouter.delete('/deleteProduct', [auth.authenticate(), validateSchema(deleteProduct)], quote.deleteProduct);
// QuoteRouter.get('/quotationProducts', auth.authenticate(), quote.quotationProducts);
// QuoteRouter.post('/createAnOrder', [auth.authenticate(), validateSchema(createAnOrder)], quote.createAnOrder);
// QuoteRouter.post('/placeAnOrder',
//     [
//         auth.authenticate(),
//         validateSchema(placeAnOrder),
//         quoteMiddleware.isOrderOwner
//     ],
//     quote.placeAnOrder);
// QuoteRouter.post('/requestForPricing', [auth.authenticate(), validateSchema(requestForPricing)], quote.requestForPricing);
// QuoteRouter.get('/getOrder/:order_id', auth.authenticate(), quote.exposeOrder);
// QuoteRouter.post('/addBillingAddress', [auth.authenticate(), validateSchema(addBillingAddress)], quote.saveBillingAddress);
// QuoteRouter.put('/updateShippingAddress', [auth.authenticate(), validateSchema(updateShippingAddress)], quote.updateShippingAddress);
// QuoteRouter.post('/billingSameAsShippingAddress',
//     [
//         auth.authenticate(),
//         validateSchema(billingSameAsShippingAddress),
//         quoteMiddleware.isOrderOwner
//     ],
//     quote.billingSameAsShippingAddress);


export default TaskCommentRouter;
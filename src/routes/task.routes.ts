// Third parties
import { Router } from 'express';
import multer from 'multer';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import QuoteMiddlware from '../middlewares/quoteMiddlware';
const uploads = multer();
// controllers
// import QuoteContorller from '../controllers/Quote/quoteContorller';
import taskController from '../controllers/Task/task.controller';

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

const TaskRouter: Router = Router();
const auth = new AuthHandler();
const quoteMiddleware = new QuoteMiddlware();

const task = new taskController();
// const quote = new QuoteContorller();


TaskRouter.post('/task',uploads.single('attachment'), task.taskCreate);
TaskRouter.get('/task', task.taskfetch);
TaskRouter.put('/task', task.taskUpdate);
TaskRouter.get('/taskAccordingProjectFetch', task.taskAccordingProjectFetch);
TaskRouter.get('/taskById', task.taskAccordingProjectFetch);
// TaskRouter.post('/addProductsCreate', [auth.authenticate(), validateSchema(addProductsForQuotation)], projectCtreate.projectCreateHandler);


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


export default TaskRouter;
// Third parties
import { Router } from 'express';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import QuoteMiddlware from '../middlewares/quoteMiddlware';

// controllers
// import QuoteContorller from '../controllers/Quote/quoteContorller';
import incomeController from '../controllers/Income/income.controller';

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

const IncomeRouter: Router = Router();
const auth = new AuthHandler();
const quoteMiddleware = new QuoteMiddlware();

const income = new incomeController();
// const quote = new QuoteContorller();


IncomeRouter.post('/income', income.Create);
IncomeRouter.get('/income', income.fetch);
IncomeRouter.put('/income', income.update);
IncomeRouter.delete('/income', income.delete);
IncomeRouter.get('/incomeAccording', income.fetchById);
// IncomeRouter.post('/addProductsCreate', [auth.authenticate(), validateSchema(addProductsForQuotation)], projectCtreate.projectCreateHandler);


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


export default IncomeRouter;
import { Router } from 'express';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import CategoryController from '../controllers/Catalogs/categoriesController';
import ProductController from '../controllers/Catalogs/productController';
import { validateSchema, addProducFaq, addFaqAnswer } from '../commonFunction/validationSchema';

const CatalogRouter: Router = Router();
const auth = new AuthHandler();
const category = new CategoryController();
const product = new ProductController();

CatalogRouter.get('/getCategoryList', category.getCategoryList);
CatalogRouter.get('/getCategoryListWithItemCount', category.getCategoryListWithItemCount);
CatalogRouter.get('/getsubCategory/:id', category.getSubCategory);
CatalogRouter.get('/getAttributeByCatId/:id', product.getAttributeList);
CatalogRouter.get('/getProductByCat/:id', product.getProductList);
CatalogRouter.get('/getProductById/:id', product.getProductDetails);
CatalogRouter.get('/relatedMoodboards/:product_id', product.relatedMoodboards);
CatalogRouter.get('/similarItems/:product_id', product.similarItems);
CatalogRouter.get('/complementaryItems/:product_id', product.getComplementaryItems);
CatalogRouter.get('/getProductTags/:tag', product.getProductTags);
CatalogRouter.get('/getProducts/:tag_id', product.getProductByTags);
CatalogRouter.get('/recommendedForMoodboard/:moodboard_id', product.recommendedForMoodboard);
CatalogRouter.get('/browseByDepartments', category.getCategoryListWithProductCount);
CatalogRouter.post('/addProductFaq', [auth.authenticate(), validateSchema(addProducFaq)], product.insertProductFaq);

// admin authenticated
CatalogRouter.put('/editProductFaq', [auth.authenticate(), validateSchema(addFaqAnswer)], product.addAnswerToFaq);
CatalogRouter.delete('/deleteProductFaq/:faq_id', auth.authenticate(), product.deleteFaqAnswer);
CatalogRouter.get('/getProductSku/:id', product.getProductSku);
export default CatalogRouter; 
// third parties
import { Router } from 'express';
import _ from 'lodash';
import multer from 'multer';

// middlewares
import { AuthHandler } from './middlewares/authHandler';
import { isAdmin } from './middlewares/isAdmin';

// routers
import UserRouter from './routes/users.routes';
import MoodboardRouter from './routes/moodboard.routes';
import ProjectRouter from './routes/project.routes';
import QuoteRouter from './routes/quote.routes';
import CatalogRouter from './routes/catalog.routes';
import AdminRouter from './routes/admin.routes';
import ProjectCreateRouter from './routes/projectCreate.routes';
import ClientRouter from './routes/client.routes';
import TaskRouter from './routes/task.routes';
import TaskCommentRouter from './routes/taskcomment.routes';
import ClientBriefRouter from './routes/clientBrief.routes';
import ClientProductRouter from './routes/clientProduct.routes';
import IncomeRouter from './routes/income.routes';
import ExpenceRouter from './routes/expence.routes';
import ContactCategoeryRouter from './routes/ContactCategoery.routes';
import ProductCategoeryRouter from './routes/ProductCategoery.routes';


// controllersExpenceRouter
import Login from './controllers/Admin/loginController';
import Attributes from './controllers/Admin/attributeControllers';
import Category from './controllers/Admin/CategoryControllers';
import Products from './controllers/Admin/productControllers';

// others 
import { masterDataMigrate } from './commonFunction/masterData';
import {
	validateSchema,
	validateFormSchema,
	adminLoginSchema,
	addAttributesSchema,
	addAttributeSetSchema,
	addCategorySchema,
	updateCategorySchema,
	updateAttributesSchema,
	updateAttributeSetSchema,
	addProduct
} from './commonFunction/validationSchema';

// literals
const uploads = multer();
const auth = new AuthHandler();
const attributes = new Attributes();
const category = new Category();
const product = new Products();
const router: Router = Router({ caseSensitive: true });
const uploadFileds = [
	{ name: 'feature_image', maxCount: 1 },
	{ name: 'slider_image0', maxCount: 1 },
	{ name: 'slider_image1', maxCount: 1 },
	{ name: 'slider_image2', maxCount: 1 },
	{ name: 'slider_image3', maxCount: 1 },
	{ name: 'slider_image4', maxCount: 1 }
];

// MasterData migration
router.get('/migrateMasterData', masterDataMigrate);

// Login routes
router.use('/adminLogin', validateSchema(adminLoginSchema), Login.adminLoginRouter);

// Attributes routes
router.post('/admin/addAttribute', [auth.authenticate(), validateSchema(addAttributesSchema)], attributes.addAttributes);
router.get('/admin/listAttributes', [auth.authenticate()], attributes.listAttributes);
router.put('/admin/updateAttributes/:id', [auth.authenticate(), validateSchema(updateAttributesSchema)], attributes.updateAttribute);
router.get('/admin/viewAttributes/:id', [auth.authenticate()], attributes.viewAttribute);
router.get('/admin/attributeListing', [auth.authenticate()], attributes.attributeListing);
router.delete('/admin/attribute/:id', [auth.authenticate()], attributes.deleteAttribute);
router.get('/test', attributes.test);

// Attributes set routes
router.post('/admin/addAttributeSets', [auth.authenticate(), validateSchema(addAttributeSetSchema)], attributes.addAttributeSet);
router.get('/admin/listAttributeSets', [auth.authenticate()], attributes.listAttributeSet);
router.get('/admin/viewAttributeSet/:attributeSetId', [auth.authenticate()], attributes.viewAttributeSet);
router.put('/admin/updateAttributeSet/:id', [auth.authenticate(), validateSchema(updateAttributeSetSchema)], attributes.updateAttributeSet);
router.delete('/admin/attributeSet/:id', [auth.authenticate()], attributes.deleteAttributeSet);

// Category routes
router.post('/admin/addCategory', uploads.single('category_image'), [auth.authenticate(), validateSchema(addCategorySchema)], category.addCategory);
router.get('/admin/listCategories', [auth.authenticate()], category.listCategories);
router.get('/admin/listCategoryItems', [auth.authenticate()], category.listCategoryItems);
router.get('/admin/viewCategory/:id', [auth.authenticate()], category.viewCategories);
router.put('/admin/updateCategory/:id', uploads.single('category_image'), [auth.authenticate(), validateSchema(updateCategorySchema)], category.updateCategoies);
router.delete('/admin/category/:id', [auth.authenticate()], category.deleteCategory);

// Products routes
router.get('/admin/attributeSetList', [auth.authenticate()], product.getAttributeList);
router.get('/admin/getAttributeDetails/:id', [auth.authenticate()], product.getAttributeSetInfo);
router.get('/admin/getAttributeTitles', [auth.authenticate()], attributes.getAttributeTitles);
router.post('/admin/addProduct', uploads.fields(uploadFileds), [auth.authenticate(), validateFormSchema(addProduct)], product.addProduct);
router.put('/admin/updateProduct/:id', uploads.fields(uploadFileds), [auth.authenticate(), validateFormSchema(addProduct)], product.updateProduct);
router.get('/admin/listProduct', [auth.authenticate()], product.listProduct);
router.get('/admin/viewProduct/:id', [auth.authenticate()], product.viewProduct);
router.delete('/admin/product/:id', [auth.authenticate()], product.deleteProduct);

// Other routes
router.use('/users', UserRouter);
router.use('/moodboards', MoodboardRouter);
router.use('/projects', ProjectRouter);
router.use('/quotes', QuoteRouter);
router.use('/catalog', CatalogRouter);
router.use('/admin', AdminRouter);
router.use('/projectCreate',ProjectCreateRouter);
router.use('/client',ClientRouter);
router.use('/task',TaskRouter);
router.use('/ClientBrief',ClientBriefRouter);
router.use('/ClientProduct',ClientProductRouter);
router.use('/income',IncomeRouter);
router.use('/expence',ExpenceRouter);
router.use('/taskComment',TaskCommentRouter);
router.use('/contactCategoery',ContactCategoeryRouter);
router.use('/productCategoery',ProductCategoeryRouter);



export default router;
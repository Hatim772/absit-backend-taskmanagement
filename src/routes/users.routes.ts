// third parties
import { Router } from 'express';
import multer from 'multer';

// middlwares
import { AuthHandler } from '../middlewares/authHandler';
import { isAdmin } from '../middlewares/isAdmin';
// routers
import { userSignupHandler } from '../controllers/Users/signupController';
import { userLoginHandler } from '../controllers/Users/loginController';
import UserDetailsController from '../controllers/Users/userDetailsController';
import AddressController from '../controllers/Users/addressController';
import * as forgotPasswordRouter from '../controllers/Users/forgotPasswordController';
import * as fieldsVerificationRouter from '../controllers/Users/emailAndMobileNumberVerficationController';
import * as userVerificationRouter from '../controllers/Users/userVerificationController';

// validation schemas
import {
    validateSchema,
    userSignup,
    userForgotPassword,
    userForgotPasswordRecoveryOrDeactivateAccount,
    userLogin,
    userShippingOrBillingAddress,
    userOTPVerification,
    updateBasicInfo,
    resendOTP,
    userAdditionalSettings,
    userVerificationDetails
} from '../commonFunction/validationSchema';


const UserRouter: Router = Router();
const auth = new AuthHandler();
const addressCtrl = new AddressController();
const user: UserDetailsController = new UserDetailsController();
const uploads = multer();

// unauthenticated endpoints
UserRouter.post('/signup', validateSchema(userSignup), userSignupHandler);
UserRouter.post('/login', validateSchema(userLogin), userLoginHandler);
UserRouter.post('/forgotPassword', validateSchema(userForgotPassword), forgotPasswordRouter.sendEmail);
UserRouter.put('/forgotPassword', validateSchema(userForgotPasswordRecoveryOrDeactivateAccount), forgotPasswordRouter.changePassword);
UserRouter.get('/confirmEmail', fieldsVerificationRouter.confirmEmail);
UserRouter.put('/confirmMobile', validateSchema(userOTPVerification), fieldsVerificationRouter.confirmMobile);
UserRouter.post('/resendOTP', validateSchema(resendOTP), fieldsVerificationRouter.resendOTP);
UserRouter.post('/userVerification',
    uploads.single('portfolio'),
    validateSchema(userVerificationDetails),
    userVerificationRouter.userVerficationDetails); // add authentication middleware in future
UserRouter.get('/userSProfile', user.getUserSProfile);

// authenticated endpoints
UserRouter.get('/isUserVerified', auth.authenticate(), user.isUserVerified);
UserRouter.put('/profilePicture', uploads.single('profilePicture'), auth.authenticate(), user.userProfilePicture);
UserRouter.get('/profile', auth.authenticate(), user.getUserSProfile);
UserRouter.get('/profilePicture', auth.authenticate(), user.getUserProfilePicture);
UserRouter.delete('/profilePicture', auth.authenticate(), user.removeUserProfilePicture);

UserRouter.put('/basicInfo', [auth.authenticate(), validateSchema(updateBasicInfo)], user.updateBasicInfo);
UserRouter.get('/basicInfo', auth.authenticate(), user.getBasicInfo);

UserRouter.post('/shippingAddress', [auth.authenticate(), validateSchema(userShippingOrBillingAddress)], addressCtrl.insertOrUpdateShippingAndBillingAddress);
UserRouter.post('/billingAddress', [auth.authenticate(), validateSchema(userShippingOrBillingAddress)], addressCtrl.insertOrUpdateShippingAndBillingAddress);
UserRouter.get('/shippingAddress', auth.authenticate(), addressCtrl.getShippingAndBillingAddress);
UserRouter.get('/billingAddress', auth.authenticate(), addressCtrl.getShippingAndBillingAddress);

UserRouter.post('/additionalSettings', [auth.authenticate(), validateSchema(userAdditionalSettings)], user.updateUserAdditionalSettings);
UserRouter.get('/additionalSettings', auth.authenticate(), user.getUserAdditionalSettings);
UserRouter.put('/deactivateAccount', [auth.authenticate(), validateSchema(userForgotPasswordRecoveryOrDeactivateAccount)], user.deactivateAccount);

// Notifications
UserRouter.get('/notifications', auth.authenticate(), user.getAllNotifications);
UserRouter.get('/getUnreadNotificationCount', auth.authenticate(), user.getUnreadNotificationCount);
UserRouter.put('/readNotification/:notification_id', auth.authenticate(), user.readNotification);
UserRouter.delete('/notification/:notification_id', auth.authenticate(), user.deleteNotification);
export default UserRouter;
import * as dotenv from 'dotenv';

import errors from '../assets/i18n/en/errors';
import messages from '../assets/i18n/en/messages';

dotenv.config({
  path: `.env.${process.env.NODE_ENV}`
});

console.log(process.env.SMTP_FROM);
const isTestEnvironment = process.env.NODE_ENV === 'test';
export default {
  errors,
  messages,
  name: 'AQSIT',
  version: '1.0',
  host: process.env.APP_HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'dev',
  port: process.env.APP_PORT || 8000,
  auth: {
    secretKey: process.env.SECRET_KEY || '4C31F7EFD6857D91E729165510520424'
  },
  // db: {
  //   host: (isTestEnvironment ? process.env.TEST_DB_HOST : process.env.DB_HOST),
  //   port: (isTestEnvironment ? process.env.TEST_DB_PORT : process.env.DB_PORT),
  //   username: (isTestEnvironment ? process.env.TEST_DB_USERNAME : process.env.DB_USERNAME),
  //   password: (isTestEnvironment ? process.env.TEST_DB_PASSWORD : process.env.DB_PASSWORD),
  //   database: (isTestEnvironment ? process.env.TEST_DB_NAME : process.env.DB_NAME),
  // },
  logging: {
    dir: process.env.LOGGING_DIR || 'logs',
    level: process.env.LOGGING_LEVEL || 'debug'
  },
  smtpDetails: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    user: process.env.SMTP_USER || 'aadesh@aqsit.com',
    pwd: process.env.SMTP_PWD || 'iwill@24',
    from: process.env.SMTP_FROM || 'no-reply <aadesh@aqsit.com>',
    port: process.env.SMTP_PORT || 587,
    logger: process.env.SMTP_LOGGER || true,
    debug: process.env.SMTP_DEBUG || true,
  },
  s3Details: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'AKIAJAKBVQHW5UPQQ3EQ',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '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',
    bucketName: process.env.S3_BUCKET_NAME || 'test-aqsit',
    acl: process.env.S3_ACL || 'public-read',
    sliderImgArray: ['slider_image0', 'slider_image1',
      'slider_image2', 'slider_image3', 'slider_image4']
  },
  imgValidation: {
    imgMaxSize: 1048576,
    imgType: ['image/gif', 'image/jpeg', 'image/png', 'image/jpg']
  },
  pdfValidation: {
    pdfMaxSize: 1048576,
    pdfType: ['application/pdf']
  },
  emailUrls: {
    userConfirmation: process.env.USER_CONFIRMATION || "http://aqsit.com/confirmEmail?token=",
    forgotPassword: process.env.FORGOT_PASSWORD_URL || "https://aqsit.com/api/users/forgotPasswordRecovery?token=",
    emailHeaderLogo: process.env.EMAIL_HEADER_LOGO || "https://aqsit.com",
    emailFooterTeam: process.env.EMAIL_FOOTER_TEAM || "https://aqsit.com/The_Aqsit_team_1.JPG",
    quotationlink: process.env.QUOTATION_LINK || "https://aqsit.com/quotation",
    herelink: process.env.PRICING_QUOTE_TEMPLATE_HERE_LINK || "https://aqsit.com/quotation"
  },
  // mongoose config
  mongooseConfig: {
    url:  `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DBNAME}` || 'mongodb://localhost:27017/aqsit_notifications'
  },
  sms: {
    apiKey: process.env.MSG91_APIKEY || '290315AxJ3hIL05d5ba6a9',
    senderId: process.env.MAG91_SENDERID || 'AQSIND',
    smsType: process.env.MAG91_SMSTYPE || '4'
  },
  notificationUrls: {
    productDetailPage: '/product-detail/',
    sampleOrderPage: '/moodboard/sample-order-confirm/'
  },
  notificationDefaultUrl: {
    url: 'http://13.126.145.80:4200'
  },
  frontUrls: {
    requestForPrice: 'http://aqsit.com/product-detail/'
  }
};

// Admin login schema
import * as Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { sendFailureResponse } from './Utills';
import * as HttpStatus from 'http-status-codes';
import { min } from 'moment';


export const addAttributeValues = {
  attribute_id: Joi.number().integer().required(),
  values: Joi.array().unique().items(Joi.string().required()).required().min(1)
};

export const updateAttributesSchema = {
  name: Joi.string().lowercase().max(150).required().trim(),
  slug: Joi.string().lowercase().max(150).required().trim(),
  type: Joi.string().valid('1', '2').required().trim(),
  attribute_title_id: Joi.number(),
  is_searchable: Joi.string().valid('0', '1').required().trim(),
  // status: Joi.string().valid('0', '1').required().trim(),
  values: Joi.array().unique().items(Joi.string().lowercase().trim()),
  is_discoverable: Joi.string().valid('0', '1').trim().optional(),
  deleted_ids: Joi.array().unique().items(Joi.number())
};


function tryParseJSON(jsonString: any) {
  try {
    var o = JSON.parse(jsonString);

    // Handle non-exception-throwing cases:
    // Neither JSON.parse(false) nor JSON.parse(1234) throw errors, hence the type-checking,
    // but... JSON.parse(null) returns null, and typeof null === "object", 
    // so we must check for that, too. Thankfully, null is falsey, so this suffices:
    if (o && typeof o === "object") {
      return o;
    }
  }
  catch (e) { }

  return false;
};
export function validateFormSchema(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(req.body);
    let body: any = {};
    body.name = req.body.name;
    // body.slug = req.body.slug;
    // body.description = req.body.description;
    body.tags = (tryParseJSON(req.body.tags)) ? JSON.parse(req.body.tags) : req.body.tags;
    body.attributes = (tryParseJSON(req.body.attributes)) ? JSON.parse(req.body.attributes) : req.body.attributes;
    body.category = req.body.category;
    // body.status = req.body.status;
    body.attribute_set_relations = req.body.attribute_set_relations;
    let result = Joi.validate(body, schema, { abortEarly: false });
    if (result.error) {
      let errors = result.error.details.map((validationError: any) => {
        return validationError.message;
      });
      return sendFailureResponse(errors, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    } else {
      next();
    }
  };
}

export const addAttributeSetSchema = {
  name: Joi.string().lowercase().max(150).required().trim(),
  slug: Joi.string().lowercase().max(150).required().trim(),
  // status: Joi.string().valid('0', '1').required().trim(),
  attribute_title_id: Joi.number(),
  attribute_ids: Joi.array().unique().items(Joi.number().required())
};

export const addCategorySchema = {
  name: Joi.string().lowercase().max(150).required().trim(),
  slug: Joi.string().lowercase().max(150).required().trim(),
  parentId: Joi.any(),
  max_single_cat_products: Joi.number().required(),
  max_multiple_cat_products: Joi.number().required(),
  // status: Joi.string().valid('0', '1').required().trim()
}

export const updateCategorySchema = {
  name: Joi.string().lowercase().max(150).required().trim(),
  slug: Joi.string().lowercase().max(150).required().trim(),
  parentId: Joi.any(),
  max_single_cat_products: Joi.number().required(),
  max_multiple_cat_products: Joi.number().required(),
  // status: Joi.string().valid('0', '1').required().trim(),
  id: Joi.number().required()
}

export const updateAttributeSetSchema = {
  name: Joi.string().lowercase().max(150).required().trim(),
  slug: Joi.string().lowercase().max(150).required().trim(),
  // status: Joi.string().valid('0', '1').required().trim(),
  attribute_ids: Joi.array().unique().items(Joi.number().required()),
  deleted_ids: Joi.array().unique().items(Joi.number()),
  id: Joi.number().required()
};

export const addProduct = {
  name: Joi.string().lowercase().max(150).required().trim(),
  tags: Joi.array().items(Joi.string()),
  attribute_set_relations: Joi.number().required(),
  category: Joi.number().required(),
  attributes: Joi.array().items(Joi.object().keys({
    id: Joi.number(),
    attribute_title_id: Joi.number(),
    value: [Joi.array().items(Joi.number()), Joi.string()]
  })).min(1)
}

/**  
 * FRONTSIDE
*/

/** User */
export const userSignup = {
  full_name: Joi.string().min(1).trim().required(),
  email: Joi.string().lowercase().email({ minDomainAtoms: 2 }).trim().required(),
  password: Joi.string().min(6).trim().required(),
  primary_mobile_number: Joi.number().required()
}

export const userOTPVerification = {
  user_id: Joi.number().required(),
  otp: Joi.number().required()
}

export const resendOTP = {
  user_id: Joi.number().required()
}

export const userShippingOrBillingAddress = {
  address_line1: Joi.string().min(1).required(),
  address_line2: Joi.string().allow('').allow(null),
  landmark: Joi.string().min(1).required(),
  city: Joi.string().min(1).required(),
  pin_code: Joi.number().min(1).required(),
  shippingSameAsBilling: Joi.boolean().optional().allow(null)
}

// update basic information
const personalInfo = {
  about: Joi.string().allow('').allow(null),
  facebookProfile: Joi.string().allow('').allow(null),
  linkedinProfile: Joi.string().allow('').allow(null),
  instagramProfile: Joi.string().allow('').allow(null),
  twitterProfile: Joi.string().allow('').allow(null),
  pinterestProfile: Joi.string().allow('').allow(null)
}

const shippingAddress = {
  address_line1: Joi.string().allow('').allow(null),
  address_line2: Joi.string().allow('').allow(null),
  landmark: Joi.string().allow('').allow(null),
  city: Joi.string().allow('').allow(null),
  pin_code: Joi.string().allow('').allow(null)
}

const verification = {
  gst_number: Joi.string().regex(/^[a-zA-Z0-9]{15,15}$/).label('GST number should be exact 15 digit long alphanumeric').allow('').allow(null)
}

// really constant values
const WEBSITE_REGEX = /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;
const WEBSITE_LABEL = 'Value must be valid format for website';

export const updateBasicInfo = {
  first_name: Joi.string().min(1).required(),
  last_name: Joi.string().min(1).required(),
  secondary_mobile_number: Joi.number().allow('').allow(null),
  username: Joi.number().allow('').allow(null),
  email: Joi.string().email({ minDomainAtoms: 2 }).trim().optional().allow(null),
  password: Joi.string().min(6).optional().allow(null),
  business_name: Joi.string().allow('').allow(null),
  website: Joi.string().regex(WEBSITE_REGEX).label(WEBSITE_LABEL).optional().allow(null).allow(''),
  verification: Joi.object(verification).optional().allow(null),
  shippingAddress: Joi.object(shippingAddress).optional().allow(null),
  personalInfo: Joi.object(personalInfo).optional().allow(null)
}
// update basic information

export const userAdditionalSettings = {
  new_product_notification: Joi.array().items(Joi.string().valid(0, 1, 2).label('new_product_notification')),
  offer_sale_notification: Joi.array().items(Joi.string().valid(0, 1, 2).label('offer_sale_notification')),
  order_update_notification: Joi.array().items(Joi.string().valid(0, 1, 2).label('order_update_notification')),
  available_day: Joi.array().unique().items(Joi.string().valid('s', 'm', 't', 'w', 'th', 'f', 'st')),
  samplebox_available_day: Joi.array().unique().items(Joi.string().valid('s', 'm', 't', 'w', 'th', 'f', 'st')),
  is_confirmed: Joi.string().valid('0', '1'),
  available_from: Joi.object({
    hour: Joi.number().max(24).required().label('available_from hour'),
    minute: Joi.number().max(60).required().label('available_from minute'),
    second: Joi.number().max(60).required().label('available_from second')
  }),
  available_to: Joi.object({
    hour: Joi.number().max(24).required().label('available_to hour'),
    minute: Joi.number().max(60).required().label('available_to minute'),
    second: Joi.number().max(60).required().label('available_to second')
  }),
  samplebox_available_from: Joi.object({
    hour: Joi.number().max(24).required().label('samplebox_available_from hour'),
    minute: Joi.number().max(60).required().label('samplebox_available_from minute'),
    second: Joi.number().max(60).required().label('samplebox_available_from second')
  }),
  samplebox_available_to: Joi.object({
    hour: Joi.number().max(24).required().label('samplebox_available_to hour'),
    minute: Joi.number().max(60).required().label('samplebox_available_to minute'),
    second: Joi.number().max(60).required().label('samplebox_available_to second')
  }),
  unsubscribe_all: Joi.boolean().optional().allow(null)
}

export const userForgotPassword = {
  email: Joi.string().lowercase().email({ minDomainAtoms: 2 }).trim().required()
}

export const addProjectManager = {
  id: Joi.number().optional().allow(null),
  first_name: Joi.string().required().min(1),
  last_name: Joi.string().required().min(1),
  password: Joi.string().min(6).optional().allow(null),
  primary_mobile_number: Joi.number().required().min(10),
  email: Joi.string().optional().email({ minDomainAtoms: 2 }).trim().lowercase().allow(null)
}

export const updateUsersPM = {
  user_id: Joi.number().min(1).required(),
  project_manager_id: Joi.number().min(1).required()
}

export const userForgotPasswordRecoveryOrDeactivateAccount = {
  password: Joi.string().min(6),
  token: Joi.string().required()
}

export const userLogin = Joi.alternatives().try(
  Joi.object().keys({
    username: Joi.string().email({ minDomainAtoms: 2 }).trim().lowercase().required(),
    password: Joi.string().max(24).required().trim(),
    isSignedIn: Joi.boolean()
  }),
  Joi.object().keys({
    username: Joi.number().required(),
    password: Joi.string().max(24).required().trim(),
    isSignedIn: Joi.boolean()
  })
);

export const userVerificationDetails = Joi.object().keys({
  business_name: Joi.string().optional().allow(null).allow(''),
  // website: Joi.string().regex(/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/).label('Value must be valid format for website').optional(),
  user_id: Joi.number().required(),
  website: Joi.string().regex(WEBSITE_REGEX).label(WEBSITE_LABEL).optional().allow(null),
  //gst_number: Joi.string().regex(/^[a-zA-Z0-9]{15,15}$/).label('GST number should be exact 15 digit long alphanumeric').allow('').allow(null),
  // cin_number: Joi.string().regex(/^[a-zA-Z0-9]{21,21}$/).label('CIN should be exact 21 digit long alphanumeric'),
  // pan_number: Joi.string().regex(/^[a-zA-Z0-9]{10,10}$/).label('PAN should be exact 10 digit long alphanumeric')
});
/** User */

/** Moodboard */
export const moodboardAdd = {
  moodboard_name: Joi.string().min(1).required(),
  moodboard_description: Joi.string().allow(null).allow(''),
  isPublic: Joi.boolean().allow(null).allow('').optional()
}
export const moodboardFavourite = {
  is_favourite: Joi.string().valid('0', '1').required(),
  moodboard_id: Joi.string().min(1).required()
}
export const moodboardDeleteOrDeleteOrApprove = {
  moodboard_id: Joi.number().min(1).required()
}
export const uploadMoodboardImage = {
  moodboard_id: Joi.number().min(1).required(),
  moodboard_imageurl: Joi.string().allow(null).optional()
}
export const moodboardRename = {
  moodboard_name: Joi.string().min(1).required(),
  moodboard_description: Joi.string().optional().allow(null).allow(''),
  moodboard_id: Joi.number().min(1).required()
}
export const moodboardAddColor = {
  moodboard_id: Joi.number().min(1).required(),
  moodboard_colors: Joi.array().min(1).items(Joi.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).label('Color must be valid Hex value')).required()
}
export const moodboardUpdateColor = {
  moodboard_id: Joi.string().min(1).required(),
  moodboard_color_id: Joi.string().min(1).required(),
  moodboard_colors: Joi.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).label('Color must be valid Hex value').required()
}
export const moodboardDeleteItem = {
  item_id: Joi.number().min(1).required()
}
export const moodboardDeleteItems = {
  moodboard_id: Joi.number().min(1).required(),
  item_ids: Joi.array().unique().min(1).items(Joi.number()).required()
}
export const moodboardProductAdd = {
  product_id: Joi.number().min(1).required(),
  moodboard_id: Joi.number().min(1).required()
}
export const moodboardFavouriteProduct = {
  is_favourite: Joi.string().valid('0', '1').required(),
  item_id: Joi.number().min(1).required()
}
export const requestForMoodboardPublic = {
  moodboard_id: Joi.number().min(1).required(),
  status: Joi.string().min(1).valid('1', '2')
}
export const adminResponseForMoodboardPublic = {
  moodboard_id: Joi.number().min(1).required(),
  status: Joi.string().min(1).valid('0','1','2')
}
export const makeMoodboardTranding = {
  status: Joi.string().min(1).valid('0', '1')
}
export const moodboardCreateLabel = {
  moodboard_id: Joi.number().min(1).required(),
  moodboard_label: Joi.string().min(1).required()
}
export const moodboardRenameLabel = {
  moodboard_id: Joi.number().min(1).required(),
  moodboard_label: Joi.string().min(1).required(),
  moodboard_label_id: Joi.number().min(1).required()
}
export const moodboardDeleteLabel = {
  moodboard_label_id: Joi.number().min(1).required()
}
export const moodboardAddLabelToProducts = {
  label_id: Joi.number().min(1).required(),
  moodboard_id: Joi.number().min(1).required(),
  items: Joi.array().min(1).unique().required()
}
export const getAllPublicOrPrivateMoodboard = {
  pageNumber: Joi.number().min(1).required(),
  recordPerPage: Joi.number().min(1).required(),
  // recordPerPage: Joi.number().min(9).required(),
  tag_id: Joi.number().min(1).required(),
  sortBy: Joi.number().min(1).valid(1, 2, 3).optional().allow(null)
}
export const getAllPublic = {
  pageNumber: Joi.number().min(1).required(),
  recordPerPage: Joi.number().min(1).required(),
  // recordPerPage: Joi.number().min(9).required(),
  sortBy: Joi.number().min(1).valid(1, 2, 3).optional().allow(null)
}
/** Moodboard */

/** Sample order */
const categorizedProducts = {
  cat_id: Joi.number().min(1).required(),
  products: Joi.array().min(1).unique().required()
}
export const moodboardMakeSampleOrder = {
  products: Joi.array().min(1).items(Joi.object(categorizedProducts)).required(),
  moodboard_id: Joi.number().min(1).required()
}
export const changeSampleOrderStatus = {
  order_id: Joi.string().min(1).required(),
  order_status: Joi.string().valid('1', '2', '3', '4', '5').required()
}
export const setUserSAddressForSampling = {
  address_line1: Joi.string().required(),
  address_line2: Joi.string().min(8).optional().allow(null),
  landmark: Joi.string().required(),
  city: Joi.string().min(1).required(),
  pin_code: Joi.number().required(),
  business_name: Joi.string().required(),
  secondary_mobile_number: Joi.number().optional().allow(null)
}
export const adminExtendSampleOrder = {
  sample_order_id: Joi.number().min(1).required(),
  status: Joi.string().required()
}
/** Sample order */

export const extendSampleOrder = {
  sample_order_id: Joi.number().min(1).required(),
}
/** Project */
export const createProject = {
  name: Joi.string().min(1).required(),
  description: Joi.string().optional().allow(null).allow(''),
  address_line1: Joi.string().allow(null).allow('').optional(),
  address_line2: Joi.string().allow(null).allow('').optional(),
  city: Joi.string().allow(null).allow('').optional(),
  pincode: Joi.number().allow(null).allow('').optional(),
  owner: Joi.string().allow(null).allow('').optional(),
  property_type: Joi.string().allow(null).allow('').optional(),
  layout: Joi.string().allow(null).allow('').optional(),
  area: Joi.string().allow(null).allow('').optional()
}
/** Project */

/** Project product */
export const addProductsForQuotation = {
  products: Joi.array().min(1).unique().required()
}

export const deleteProduct = {
  order_reference_id: Joi.number().min(1).required()
}

export const insider_products = {
  order_ref_id: Joi.number().min(1).required(),
  quantity: Joi.number().min(1).required(),
  unit: Joi.string().min(1).optional().allow(null),
  special_instructions: Joi.string().min(1).optional().allow(null),
}

export const createAnOrder = {
  project_id: Joi.number().min(1).required(),
  orders: Joi.array().min(1).items(Joi.object(insider_products)).required(),
  // shippingAddress: Joi.object({
  //   business_name: Joi.string().min(1).required(),
  //   address_line1: Joi.string().min(1).required(),
  //   address_line2: Joi.string().min(1).optional().allow(null),
  //   city: Joi.string().min(1).required(),
  //   landmark: Joi.string().min(1).required(),
  //   pin_code: Joi.number().min(1).required(),
  //   primary_mobile_number: Joi.number().min(1).required(),
  //   secondary_mobile_number: Joi.number().min(1).optional().allow(null),
  // })
}

export const placeAnOrder = {
  order_id: Joi.number().min(1).required(),
  transaction_id: Joi.string().min(1).required()
}

export const addBillingAddress = {
  order_id: Joi.number().min(1).required(),
  address_line1: Joi.string().min(1).required(),
  address_line2: Joi.string().min(1).optional().allow(null),
  city: Joi.string().min(1).required(),
  contact_person_name: Joi.string().min(1).required(),
  landmark: Joi.string().min(1).required(),
  phone_number: Joi.number().min(1).required(),
  pin_code: Joi.number().min(1).required(),
}

export const updateShippingAddress = {
  order_shipping_address_id: Joi.number().optional(),
  business_name: Joi.string().min(1).required(),
  address_line1: Joi.string().min(1).required(),
  address_line2: Joi.string().min(1).optional().allow(null),
  city: Joi.string().min(1).required(),
  pin_code: Joi.number().min(1).required(),
  primary_mobile_number: Joi.number().min(1).required(),
  secondary_mobile_number: Joi.number().min(1).optional().allow(null),
  landmark: Joi.string().min(1).required(),
  contact_person_name: Joi.string().min(1).required(),
  order_id: Joi.number().optional()
}

export const billingSameAsShippingAddress = {
  shipping_address_id: Joi.number().min(1).required(),
  order_id: Joi.number().min(1).required()
}

export const addBankDetails = {
  order_id: Joi.number().min(1).required(),
  bank_name: Joi.string().min(1).required(),
  account_type: Joi.string().min(1).valid('1', '2', '3').required(),
  beneficiary_name: Joi.string().min(1).required(),
  account_number: Joi.string().min(1).required(),
  ifsc_code: Joi.string().min(1).required()
}
/** Project product */

/** Project Files */
export const uploadAProjectFile = {
  project_id: Joi.number().min(1).required(),
  file_type: Joi.string().min(1).valid('1', '2', '3', '4').required(),
  project_file_id: Joi.number().min(1).optional().allow(null),
  order_id: Joi.string().min(1).optional().allow(null)
}
export const renameAProjectFile = {
  project_file_id: Joi.number().min(1).required(),
  file_name: Joi.string().min(1).required()
}
export const getProjectFiles = {
  project_id: Joi.number().min(1).required(),
  downloads: Joi.boolean().optional().allow(null)
}
/** Project Files */

/** Request for pricing */

export const requestForPricing = {
  product_id: Joi.number().min(1).required(),
  quantity: Joi.number().min(1).required()
}

export const sendingPricing = {
  pricing_id: Joi.number().min(1).required(),
  price: Joi.number().min(1).required()
}

export const quoteOrder = {
  order_id: Joi.number().min(1).required(),
  quotationAmount: Joi.number().min(1).required()
}

export const orderDeliveryStatus = {
  order_id: Joi.number().min(1).required(),
  // eta: Joi.date().iso().required()
};

/** Request for pricing */

export const adminLoginSchema = {
  email: Joi.string().lowercase().max(250).email().required().trim(),
  password: Joi.string().max(24).required().trim()
};

export const listEntitySchema = {
  pageNo: Joi.number().integer().required(),
  recorderPerPage: Joi.number().integer()
};

export const addAttributesSchema = {
  name: Joi.string().lowercase().max(150).required().trim(),
  slug: Joi.string().lowercase().max(150).required().trim(),
  type: Joi.string().valid('1', '2').required().trim(),
  is_searchable: Joi.string().valid('0', '1').required().trim(),
  attribute_title_id: Joi.number().required(),
  // status: Joi.string().valid('0', '1').required().trim(),
  values: Joi.any(),
  is_discoverable: Joi.string().valid('0', '1').trim().optional(),
};

export const addProducFaq = {
  question: Joi.string().required(),
  productId: Joi.number().required()
}

export const addFaqAnswer = {
  faq_id: Joi.number().min(1).required(),
  answer: Joi.string().min(1).required(),
  status: Joi.string().valid('0', '1', '2').required()
}

export const addOrUpdateBankDetails = {
  bank_name: Joi.string().min(1).required(),
  account_type: Joi.string().min(1).required().valid('1', '2', '3'),
  account_number: Joi.string().min(1).required(),
  beneficiary_name: Joi.string().min(1).required(),
  ifsc_code: Joi.string().min(1).required()
}


/** For Order Project Files */
export const uploadAOrderProjectFile = {
  project_id: Joi.number().min(1).required(),
  user_id: Joi.number().min(1).required().allow(null),
  file_type: Joi.string().min(1).valid('1', '2', '3', '4').required(),
  project_file_id: Joi.number().min(1).optional().allow(null),
  order_id: Joi.string().min(1).optional().allow(null)
}
/** For Order Project Files */

export function validateSchema(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    let result = Joi.validate(req.body, schema, { abortEarly: false });
    if (result.error) {
      let errors = result.error.details.map((validationError: any) => {
        if (validationError.message.includes('fails to match the required pattern')) {
          return validationError.message.substring(0, validationError.message.indexOf('with value')).replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '');
        }
        return validationError.message.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '');
      });
      return sendFailureResponse(errors, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
    } else {
      next();
    }
  };
}
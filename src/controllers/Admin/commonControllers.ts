import { NextFunction, Request, Response, Router } from 'express';
import * as HttpStatus from 'http-status-codes';
import * as _ from 'lodash';
import config from '../../config/config';
import { sendSuccessResponse, sendFailureResponse } from '../../commonFunction/Utills';
// import { CommonService } from '../../services/admin/common.service';
// const { errors } = config;

// // Add attribute
// async function addAttributes(req: Request, res: Response) {
// 	try {
// 		let data = _.pick(req.body, ['name', 'slug']);
// 		await new CommonService().insertEntity('attributes', data);
// 		return sendSuccessResponse(`Success`, HttpStatus.OK, true, res);
// 	} catch (err) {
// 		let message = (err.code === 'ER_DUP_ENTRY') ? errors.DUPLICATE_ATTRIBUTE_NAME : err.message;
// 		return sendFailureResponse(message, HttpStatus.INTERNAL_SERVER_ERROR, false, res);
// 	}
// }

// // List attributes
// async function listAttributes(req: Request, res: Response) {
// 	let data = _.pick(req.body, ['pageNo', 'recordPerPage', 'orderby', 'groupBy', 'orderbydirection']);
// 	let attributes = await new CommonService().listEntity('attributes', data);
// 	return sendSuccessResponse(attributes, HttpStatus.OK, true, res);
// }

// const commonRoutes = {
// 	addAttributes, listAttributes
// };

// export default commonRoutes;
// import config from '../config/config';
import { ApiSuccessResponse, ApiFailureResponse } from '../resources/interfaces/ApiResponseError';
import * as HttpStatus from 'http-status-codes';
import { Response } from 'express';

export async function sendErrorMessage(errors: any, next: any) {
	let resError: Array<any> = [];
	let error = errors.reduce((obj: any, item: any) => {
		resError.push(item.constraints[Object.keys(item.constraints)[0]]);
	}, {});
	sendFailureResponse(resError[0], HttpStatus.BAD_REQUEST, false, next);
}

export function sendSuccessResponse(messages: string | any, statusCode: number, isSuccess: boolean, response: Response) {
	const res: ApiSuccessResponse = {
		success: isSuccess,
		code: statusCode,
		result: messages
	};
	return response.status(statusCode).json(res);
}
export function sendFailureResponse(messages: any, statusCode: any, isSuccess: any, response: any) {
	const res: ApiFailureResponse = {
		success: isSuccess,
		code: statusCode,
		message: messages
	};
	return response.status(statusCode).json(res);
}
export function generateRandomString(type: number) {
	let length = (type === 1) ? 8 : 12;
	let passwd = '';
	let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	for (let i = 1; i < length; i++) {
		let c = Math.floor(Math.random() * chars.length + 1);
		passwd += chars.charAt(c);
	}
	return passwd;
}
export function getEntities(entityName: string) {
	let entity: any;
	// switch (entityName) {
	// 	case 'users':
	// 		entity = User;
	// 		break;
	// 	case 'event_groups':
	// 		entity = EventGroups;
	// 		break;
	// 	case 'companies':
	// 		entity = Companies;
	// 		break;
	// 	case 'country':
	// 		entity = Country;
	// 		break;
	// 	case 'currencies':
	// 		entity = Currencies;
	// 		break;
	// 	case 'events':
	// 		entity = Events;
	// 		break;
	// 	case 'event_sub_groups':
	// 		entity = EventSubGroups;
	// 		break;
	// 	case 'event_vendors':
	// 		entity = EventVendors;
	// 		break;
	// 	case 'projects':
	// 		entity = Projects;
	// 		break;
	// 	case 'roles':
	// 		entity = Roles;
	// 		break;
	// 	case 'time_zone':
	// 		entity = TimeZone;
	// 		break;
	// 	default:
	// 		// code...
	// 		break;
	// }
	return entity;
}

/**
 * Get orderby 
 */
export function retriveOrderBy(params: any, qsParam: string, defaultSort: number): number {
	if (params.indexOf(qsParam) !== -1) {
		return params.indexOf(qsParam) + 1;
	} else {
		return defaultSort;
	}
}

export function retriveOrderByDirection(a: string): string {
	if (a && a.toLowerCase() === 'desc') {
		return 'D';
	} else {
		return 'A';
	}
}
import * as HttpStatus from 'http-status-codes';
import { sendFailureResponse } from "./Utills";
import _ from 'lodash';
export function throwAnError(error: any, res: any) {
    let message = Object.prototype.hasOwnProperty.call(error, 'message') ? error.message : error;
    sendFailureResponse(message, Object.prototype.hasOwnProperty.call(error, 'message') ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST, false, res);
}

export function throwAnIndexedError(error: any, res: any) {
    let message;
    let messageArr = error.code == "ER_DUP_ENTRY" ? error.message.split(" ") : error;
    if (_.isArray(messageArr)) {
        message = messageArr[messageArr.length - 1].replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '').replace("_IDX", '') + " is taken.";
    } else {
        message = messageArr;
    }
    sendFailureResponse(message, error.code == "ER_DUP_ENTRY" ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR, false, res);
}
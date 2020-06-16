// Third parties
import { Request, Response } from 'express';
import * as HttpStatus from 'http-status-codes';
import _ from 'lodash';

// Locals
import config from '../../config/config';
import { sendSuccessResponse as success, sendFailureResponse as failure } from '../../commonFunction/Utills';
import { throwAnError } from '../../commonFunction/throwAnError';
import { CommonService } from '../../services/common.service';

// entities
import { AQSITBankDetails } from '../../entities/AQSITBankDetails';

let common: CommonService = new CommonService();

export default class BankController {
    constructor() { }

    async addOrUpdateBankDetails(req: Request, res: Response) {
        try {
            const body = _.pick(req.body, ['bank_name', 'account_type', 'beneficiary_name', 'account_number', 'ifsc_code']);
            common = new CommonService('AQSITBankDetails');
            let { 0: bankDetails }: AQSITBankDetails[] = await common.getAll();
            if (!bankDetails) {
                // insert case
                bankDetails = await common.insert(body);
            } else {
                // update case
                bankDetails.bank_name = body.bank_name;
                bankDetails.account_type = body.account_type;
                bankDetails.account_number = body.account_number;
                bankDetails.beneficiary_name = body.beneficiary_name;
                bankDetails.ifsc_code = body.ifsc_code;
                bankDetails = await common.update(bankDetails);
            }
            success(bankDetails, HttpStatus.OK, true, res);
        } catch (error) {
            throwAnError(error, res);
        }
    }
}
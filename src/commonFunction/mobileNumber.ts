import axios  from "axios";
import config from "../config/config";
console.log(config.sms);
var msg91 = require("msg91")(config.sms.apiKey, config.sms.senderId, config.sms.smsType );

export async function sendOTP(user: any): Promise<any> {
    const content = `${user.otp} is your Aqsit login OTP.For security reasons, do not share OTP with anyone.`;
    msg91.send(user.primary_mobile_number, content, (err: any, response: any) => {
    	console.log(err);
    	console.log(response);
	});
}

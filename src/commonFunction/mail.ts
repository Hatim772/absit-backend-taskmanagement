import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';

import config from '../config/config';
console.log(config.smtpDetails);
export class Mail {

    // Sent email
    async sendEmail(res: any, email: any, subject: any, html_body: any) {
        const transporter = nodemailer.createTransport({
            host: config.smtpDetails.host,
            port: 465,
            secure: true,
            auth: {
                user: config.smtpDetails.user,
                pass: config.smtpDetails.pwd
            }
        });
        const mailOptions = {
            from: config.smtpDetails.from,
            to: email,
            subject: subject,
            html: html_body
        };
        await transporter.sendMail(mailOptions, (eror, info) => {
            if (eror) {
                transporter.close();
                console.log('Error', eror);
            }
            transporter.close();
        });
    }

    async htmlGenerate(res: any, template: any, data: any) {

        return new Promise((resolve, reject) => {
            res.render(path.resolve(`src/assets/email-templates/${template}.html`), data, function (err: any, emailHTML: any) {
                if (err) {
                    console.log('Error html', err);
                } else {
                    // console.log('Success', emailHTML);
                    resolve(emailHTML);
                }
            });
        });
    }

    async replaceHTML(text: any, findArray: any, replaceArray: any) {
        let result = await this.replaceStr(text, findArray, replaceArray);
        // console.log('result', result);
        return result;
    }

    async replaceStr(str: any, find: any, replace: any) {
        for (var i = 0; i < find.length; i++) {
            str = str.replace(find[i], replace[i]);
        }
        return str;
    }
}


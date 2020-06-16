import config from '../config/config';
import * as nodemailer from 'nodemailer';
import ejs from 'ejs';

const transport = nodemailer.createTransport({
    host: config.smtpDetails.host,
    port: 465,
    secure: true,
    auth: {
        user: config.smtpDetails.user,
        pass: config.smtpDetails.pwd
    },
    logger: true,
    debug: true
}, {
        from: config.smtpDetails.from,
    });

export async function sendEmail(user: any) {
    let message = {
        to: user.email,
        subject: 'AQSIT: ACTIVATE ACCOUNT',
        html: `
        <div>
            <h1 style="text-align: center">AQSIT Account Activation</h1>
            <p>Hey there,</p>
            <p>Your account has been successfully created.</p>
            <p>Now please activate your account by clicking below link.</p>
            <a href="${config.emailUrls.userConfirmation + user.activation_token + '&id=' + user.id}">CLICK HERE IF YOU APPLIED</a>
            <p style="color: #f20000;">NOTE: CLICK AND ACTIVATE ONLY IF YOU APPLIED</p>
        </div>
        `
    };
    return new Promise((resolve, reject) => {
        transport.sendMail(message, (err, res) => {
            console.log('RESPONSE', JSON.stringify(res));
            if (err) {
                console.log('EMAIL ERROR', err.message);
                transport.close();
                reject(err);
            } else {
                console.log('Success');
                transport.close();
                resolve(true);
            }
        });
    });
}

export async function sendEmailForForgotPassword(userEmail: string, token: string) {


    let message = {
        to: userEmail,
        subject: 'AQSIT: PASSWORD RECOVERY',
        html: `
        <div>
            <h1 style="text-align: center">AQSIT Password Recovery</h1>
            <p>Your have been asked for password recovery.</p>
            <p>In order to change password use following link which is available for next an hour.</p>
            <a href="${config.emailUrls.forgotPassword + token}">CLICK HERE IF YOU APPLIED</a>
            <p style="color: #f20000;">NOTE: CLICK/CHANGE PASSWORD ONLY IF YOU APPLIED</p>
        </div>
        `
    };
    return new Promise((resolve, reject) => {
        transport.sendMail(message, (err, res) => {
            console.log('RESPONSE', JSON.stringify(res));
            if (err) {
                console.log('EMAIL ERROR', err.message);
                transport.close();
                reject(err);
            } else {
                console.log('Success');
                transport.close();
                resolve(true);
            }
        });
    });
}

export async function sendEmailForUserVerfication(userVerificationDetails: any) {
    let message = {
        to: userVerificationDetails.email,
        subject: 'AQSIT: USER VERIFICATION',
        html: `
        <div>
            <h1 style="text-align: center">AQSIT User Verification</h1>
            <p>Hey ${userVerificationDetails.username},<p>
            <p>Your account has been verified here are your Project manager's details.</p>
            <table style="width:100%">
                <tr>
                    <th>Detail no</th>
                    <th>Detail name</th>
                    <th>Detail value</th>
                </tr>
                <tr>
                    <td>1</td>
                    <td>Fullname</td>
                    <td>${userVerificationDetails.projectManager.full_name}</td>
                </tr>
                <tr>
                    <td>2</td>
                    <td>Email</td>
                    <td>${userVerificationDetails.projectManager.email}</td>
                </tr>
                <tr>
                    <td>3</td>
                    <td>Phone number</td>
                    <td>${userVerificationDetails.projectManager.phone_number}</td>
                </tr>
            </table>
            <p style="color: #f20000;">NOTE: IGNORE IF YOU HAVE NOT APPLIED</p>
        </div>
        `
    };
    return new Promise((resolve, reject) => {
        transport.sendMail(message, (err, res) => {
            console.log('RESPONSE', JSON.stringify(res));
            if (err) {
                console.log('EMAIL ERROR', err.message);
                transport.close();
                reject(err);
            } else {
                console.log('Success');
                transport.close();
                resolve(true);
            }
        });
    });
}

export async function sendEmailForQutationToUser(data: any) {
    let message = {
        to: data.email,
        subject: 'AQSIT: USER QUOTATION',
        html: `
        <div>
            <p>Hey ${data.username},<p>
            <p>We have got your quotation request, checking it out just wait for a while. If you got any query feel free to speak out to your PM.</p>
            <p style="font-weight: 600;">YOUR ORDER IDs ARE:</p>
            <pre>${JSON.stringify(data.order_data, undefined, 2)}</pre>
            <p style="color: #f20000;">NOTE: IGNORE IF YOU HAVE NOT APPLIED</p>
        </div>`
    };
    return new Promise((resolve, reject) => {
        transport.sendMail(message, (err, res) => {
            console.log('RESPONSE', JSON.stringify(res));
            if (err) {
                console.log('EMAIL ERROR', err.message);
                transport.close();
                reject(err);
            } else {
                console.log('Success');
                transport.close();
                resolve(true);
            }
        });
    });
}

// remaimed this one make it whole

export async function sendEmailForRequestForPricing(data: any) {
    let message = {
        to: data.user.email,
        subject: 'AQSIT: REQUESTED FOR PRICING',
        html: `
        <div>
            <p>Hey ${data.user.username},<p>
            <p>You have asked for pricing for the below product.</p>
            <a href="${config.frontUrls.requestForPrice + data.pricing.product_id}">Check product details here</a>
            <p>It will be <strong>${data.pricing.price} Rupees</string> for quantity <strong>${data.pricing.quantity}</strong>.</p>
        </div>`
    };
    return new Promise((resolve, reject) => {
        transport.sendMail(message, (err, res) => {
            console.log('RESPONSE', JSON.stringify(res));
            if (err) {
                console.log('EMAIL ERROR', err.message);
                transport.close();
                reject(err);
            } else {
                console.log('Success');
                transport.close();
                resolve(true);
            }
        });
    });
}

import * as AWS from 'aws-sdk';
import * as multer from 'multer';
import config from '../config/config';
let s3bucket = new AWS.S3({
  accessKeyId: config.s3Details.accessKeyId,
  secretAccessKey: config.s3Details.secretAccessKey,
});

export function uploadImgToS3(file: any) {
  return new Promise((resolve: any, reject: any) => {
    let params = {
      Bucket: config.s3Details.bucketName,
      Key: file.originalname,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: config.s3Details.acl
    };
    s3bucket.upload(params, (err: any, data: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

export function deleteFileFromS3(file: any) {
  return new Promise((resolve: any, reject: any) => {
    let params = {
      Bucket: config.s3Details.bucketName,
      Key: file
    };
    s3bucket.deleteObject(params, (err: any, data: any) => {
      if (err) {
        console.log('err', err);
        reject(err);
      } else {
        console.log('data', data);
        resolve(data);
      }
    });
  });
}

export function validateProjectImg(imgData: any) {
  let errors: any = [];
  for (let img in imgData) {
    if (imgData[img][0].size >= config.imgValidation.imgMaxSize) {
      errors.push(`${img} must be less then ${config.imgValidation.imgMaxSize / 1024} KB`);
    }
    if (!config.imgValidation.imgType.includes(imgData[img][0].mimetype)) {
      errors.push(`${img} must be valid image type`);
    }
  }
  return errors;
}

export function validatePdf(file: any) {
  let errors: any = [];
  if (file.size >= config.pdfValidation.pdfMaxSize)
    errors.push(`${file.originalname} must be less then ${config.pdfValidation.pdfMaxSize / 1024} KB`);
  // if (!config.pdfValidation.pdfType.includes(file.mimetype))
  //   errors.push(`${file.originalname} must be pdf type`);
  return errors;
}

export function validateSingleImg(imgData: any) {
  let errors: any = [];
  if (imgData) {
    if (imgData.size >= config.imgValidation.imgMaxSize) {
      errors.push(`image must be less then ${config.imgValidation.imgMaxSize / 1024} KB`);
    }
    if (!config.imgValidation.imgType.includes(imgData.mimetype)) {
      errors.push(`image must be valid image type`);
    }
  }
  return errors;
}

export function updateImgToS3(file: any, key: any) {
  return new Promise((resolve: any, reject: any) => {
    let params = {
      Bucket: config.s3Details.bucketName,
      Key: key,
      Body: file,
      ContentType: 'image/png',
      ACL: config.s3Details.acl
    };
    s3bucket.upload(params, (err: any, data: any) => {
      console.log('err', err);
      if (err) {
        reject(err);
      } else {
        console.log(data);
        resolve(data);
      }
    });
  });
}
import 'reflect-metadata';

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import ejs from 'ejs';
import config from './config/config';
import { AuthHandler } from './middlewares/authHandler';
import genericErrorHandler from './middlewares/genericErrorHandler';
import nodeErrorHandler from './middlewares/nodeErrorHandler';
import notFoundHandler from './middlewares/notFoundHandler';
import routes from './routes';
import { Logger, ILogger } from './utils/logger';
import { getConnection } from './commonFunction/ConnPool';
import mongoConnection from './commonFunction/mongooseConn';

export class Application {
  app: express.Application;
  config = config;
  logger: ILogger;

  constructor() {
    this.logger = new Logger(__filename);
    this.app = express();
    this.app.locals.name = this.config.name;
    this.app.locals.version = this.config.version;
    this.app.use(express.static(__dirname + '/assets/images'));

    this.app.use(require('express-status-monitor')());
    this.app.use(cors());
    this.app.use(helmet());
    this.app.use(morgan('dev', {
      skip: (() => process.env.NODE_ENV === 'test')
    }));
    this.app.use(bodyParser.json({ limit: '50mb' }));
    this.app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
    this.app.use(new AuthHandler().initialize());
    this.app.set('case sensitive routing', true);
    this.app.use('/api', routes);
    this.app.use(genericErrorHandler);
    this.app.use(notFoundHandler);
    this.app.engine('html', require('ejs').renderFile);

    this.app.set('views', __dirname + '/assets/email-templates');
    this.app.set('view engine', 'ejs');




  }

  setupDbAndServer = async () => {
    try {
      await getConnection();
      await mongoConnection();
      this.logger.info(`Connected to MySQL & MongoDB`);
      await this.startServer();
    } catch (error) {
      nodeErrorHandler(error);
    }
  }

  startServer(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.app.listen(+this.config.port, this.config.host, () => {
        this.logger.info(`Server started at http://${this.config.host}:${this.config.port}`);
        resolve(true);
      }).on('error', nodeErrorHandler);
    });
  }
}

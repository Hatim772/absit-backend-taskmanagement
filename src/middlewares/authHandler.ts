import jwt from 'jsonwebtoken';
import passport from 'passport';
import * as bcrypt from 'bcrypt';
import { ExtractJwt, Strategy as JWTStrategy, StrategyOptions } from 'passport-jwt';
import { Strategy } from 'passport';
import config from '../config/config';
import UserService from '../services/users/users.service';
const { auth } = config;
const userModel = new UserService();
export class AuthHandler {

  jwtOptions: StrategyOptions;
  superSecret = auth.secretKey;

  constructor() {
    this.jwtOptions = {
      jwtFromRequest: ExtractJwt.fromHeader('token'), // HEADER: Authorization: bearer JSON_WEB_TOKEN_STRING.....
      secretOrKey: this.superSecret
    };
  }

  /**
   * initialize the Auth middleware & configure JWT strategy for Passport
   */
  initialize() {
    passport.use('jwt', this.getStrategy());
    return passport.initialize();
  }

  /**
   * configure & return the JWT strategy for passport
   */
  getStrategy(): Strategy {
    return new JWTStrategy(this.jwtOptions, async (jwt_payload, next) => {
      try {
        const user: any = await userModel.getUser(jwt_payload.email, jwt_payload.type);
        if (!user) {
          return next(null, false);
        } else {
          if (!bcrypt.compare(user.password, await bcrypt.hash(user.password, 10))) {
            return next(null, false);
          } else {
            return next(null, user);
          }
        }
      } catch (err) {
        return next(null, false);
      }
    });
  }

  /**
   * Authentication handler. Call this on routes needs authentication
   */
  authenticate() {
    return passport.authenticate('jwt', { session: false, failWithError: true });
  }

  /**
   * Generate JWT token.
   * @param user
   */
  generateToken(user: any, flag: boolean): string {
    let time = '24h';
    if(flag) {
      time = '365d'
    }
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      type: user.user_role
    }, this.superSecret, {
        expiresIn: time,
      });
    return token;
  }
}

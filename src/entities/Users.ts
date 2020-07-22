import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, OneToOne } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { MoodboardOrders } from './MoodboardOrders';
// import { ProjectManager } from './ProjectManager';
import { Moodboard } from './Moodboard';
import { ProductFaq } from './ProductFaq';
import { UsersVerificationDetails } from './UsersVerificationDetails';
import { UsersShippingAddress } from './UsersShippingAddress';
import { UsersAdditionalSettings } from './UsersAdditionalSettings';
import { RequestForPricing } from './RequestForPricing';
import { OrderShippingAddress } from './OrderShippingAddress';
import { ProjectFiles } from './ProjectFiles';
import { UserPersonalInformation } from './UserPersonalInformation';
import { Labels } from './Labels';
import { OrdersReference } from './OrdersReference';

import { ClientProductDetails } from "./clientProduct";


@Entity()
export class Users {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('username_IDX', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  username: string;

  @Index('business_name_IDX', { unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  business_name: string;

  @Index('email_IDX', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'int', width: 11, nullable: true })
  project_manager_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  first_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  last_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Index('primary_mobile_number_IDX', { unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  primary_mobile_number: number;

  @Index('secondary_mobile_number_IDX', { unique: true })
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  secondary_mobile_number: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  profile_pic: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- InActive, 1- Active)', default: '1' })
  is_activate: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  activation_token: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  otp: string;

  @Column({ type: 'enum', enum: ['1', '2', '3'], comment: '(1-User, 2-Admin, 3-ProjectManager )' })
  user_role: string;

  @Column({ type: 'enum', enum: ['0', '1', '2', '3'], comment: '(0-Not verified user, 1- Verified user, 2- not enough data, 3- decline)' })
  status: string;

  @Column({ type: 'date', nullable: true })
  lastPasswordChangeDate: Date;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @OneToOne(type => UsersVerificationDetails, usersVerificationDetails => usersVerificationDetails.user)
  userVerificationDetails: UsersVerificationDetails;

  @OneToOne(type => UsersShippingAddress, usersShippingAddress => usersShippingAddress.user)
  usersShippingAddress: UsersShippingAddress;

  @OneToOne(type => UsersAdditionalSettings, usersAdditionalSettings => usersAdditionalSettings.user)
  usersAdditionalSettings: UsersAdditionalSettings;

  @OneToOne(type => UserPersonalInformation, userPersonalInformation => userPersonalInformation.user)
  userPersonalInformation: UserPersonalInformation;

  @OneToMany(type => MoodboardOrders, moodboardOrders => moodboardOrders.user)
  moodboardOrders: MoodboardOrders[];

  @OneToMany(type => Labels, label => label.user)
  labels: Labels[];

  @OneToMany(type => Moodboard, moodboard => moodboard.user)
  moodboard: Moodboard[];

  @OneToMany(type => OrdersReference, orderRef => orderRef.user)
  orderRef: OrdersReference[];

  @OneToMany(type => ProductFaq, productFaq => productFaq.creator)
  productFaq: ProductFaq[];

  @OneToMany(type => ProductFaq, creator => creator.creator)
  creator: ProductFaq[];

  @OneToMany(type => ProductFaq, answerd => answerd.answerer)
  answerd: ProductFaq[];

  @OneToMany(type => OrderShippingAddress, orderShippingAddress => orderShippingAddress.user)
  orderShippingAddress: OrderShippingAddress[];

  @OneToMany(type => ProjectFiles, projectFiles => projectFiles.user)
  projectFiles: ProjectFiles[];

  @OneToMany(type => ClientProductDetails, clientProductDetails => clientProductDetails.user)
  clientProductDetails : ClientProductDetails;

  @OneToMany(type => RequestForPricing, requestForPricing => requestForPricing.user)
  requestForPricing: RequestForPricing[];

  @ManyToOne(type => Users, user => user.children)
  @JoinColumn({ name: 'project_manager_id' })
  projectManager: Users;

  @OneToMany(type => Users, user => user.projectManager)
  children: Users[];

  static async setPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  @BeforeInsert()
  async encryptPassword() {
    this.password = await bcrypt.hash(this.password, 10);
  }
}
import { Column, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { Users } from './Users';
@Entity()
export class UsersVerificationDetails {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('user_IDX', {unique: true})
  @Column({ type: 'int', width: 11 })
  user_id: number;

  @Index('gst_number_IDX', {unique: true})
  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  gst_number: string;

  @Index('cin_number_IDX', {unique: true})
  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  cin_number: string;

  @Index('pan_number_IDX', {unique: true})
  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  pan_number: string;

  @Index('portfolio_file_IDX', {unique: true})
  @Column({ type: 'varchar', length: 255, nullable: true })
  portfolio_file: string;

  @OneToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;
}
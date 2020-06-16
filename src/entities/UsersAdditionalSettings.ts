import { Column, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Users } from './Users';
@Entity()
export class UsersAdditionalSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11 })
  user_id: number;

  @Column({ type: 'varchar', length: 25, nullable: true })
  new_product_notification: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  offer_sale_notification: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  order_update_notification: string;

  @Column({ type: 'json', nullable: true })
  available_from: JSON;

  @Column({ type: 'json', nullable: true })
  available_to: JSON;

  @Column({ type: 'json', nullable: true })
  samplebox_available_from: JSON;

  @Column({ type: 'json', nullable: true })
  samplebox_available_to: JSON;

  @Column({ type: 'varchar', length: 25, nullable: true })
  available_day: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  samplebox_available_day: string;

  @Column({ type: 'enum', enum: ['0', '1'], nullable: true, comment: '(0-Not confirmed, 1- Confirmed)' })
  is_confirmed: string;

  @Column({ type: 'enum', enum: [true, false], default: false, comment: '(false- is not unsubscribe all, true- is unsubscribe all)' })
  is_unsubscribe_all: string;

  @OneToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;
}
import { Column, Entity, PrimaryGeneratedColumn, JoinColumn, OneToOne, ManyToOne, OneToMany } from 'typeorm';
import { Users } from './Users';
import { Orders } from './Orders';

@Entity()
export class OrderShippingAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11 })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contact_person_name: string;

  @Column({ type: 'varchar', length: 255 })
  business_name: string;

  @Column({ type: 'varchar', length: 255 })
  address_line1: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line2: string;

  @Column({ type: 'varchar', length: 255 })
  city: string;

  @Column({ type: 'varchar', length: 255 })
  landmark: string;

  @Column({ type: 'varchar', length: 6 })
  pin_code: string;

  @Column({ type: 'varchar', length: 10 })
  primary_mobile_number: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  secondary_mobile_number: string;

  @ManyToOne(type => Users)
  @JoinColumn({name: 'user_id'})
  user: Users;

  @OneToMany(type => Orders, orders => orders.orderShippingAddress)
  orders: Orders[];
}
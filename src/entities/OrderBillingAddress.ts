import { Column, JoinColumn, Entity, PrimaryGeneratedColumn, OneToOne} from 'typeorm';
import { Orders } from './Orders';

@Entity()
export class OrderBillingAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11 })
  order_id: number;

  @Column({ type: 'varchar', length: 255 })
  contact_person_name: string;

  @Column({ type: 'varchar', length: 255 })
  address_line1: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line2: string;

  @Column({ type: 'varchar', length: 255 })
  landmark: string;
  
  @Column({ type: 'varchar', length: 255 })
  city: string;

  @Column({ type: 'varchar', length: 11 })
  pin_code: String;

  @Column({ type: 'varchar', length: 20 })
  phone_number: number;

  @OneToOne(type => Orders, order => order.orderBillingAddress)
  @JoinColumn({name: 'order_id'})
  order: Orders;
}
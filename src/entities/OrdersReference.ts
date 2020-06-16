import { Column, CreateDateColumn, ManyToOne, JoinColumn, Entity, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Products } from './Products';
import { Projects } from './Project';
import { Users } from './Users';
import { Orders } from './Orders';
@Entity()
export class OrdersReference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 9 })
  product_id: number;

  @Column({ type: 'int', width: 9 })
  user_id: number;

  @Column({ type: 'int', width: 9, nullable: true })
  project_id: number;

  @OneToMany(type => Orders, order => order.orderRef)
  order: Orders[];

  @ManyToOne(type => Projects)
  @JoinColumn({ name: 'project_id' })
  project: Projects;

  @ManyToOne(type => Products)
  @JoinColumn({ name: 'product_id' })
  product: Products;

  @ManyToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @CreateDateColumn()
  createdDate: Date;
}
import { Column, CreateDateColumn, ManyToOne, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, OneToOne } from 'typeorm';
import { Projects } from './Project';
import { Users } from './Users';
import { Orders } from './Orders';
@Entity()
export class ProjectFiles {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({type: 'varchar', width: 255})
  file_name: string;

  @Column({type: 'varchar', width: 11})
  file_size: string;

  @Column({type: 'enum', enum: ['1', '2', '3'], comment: '(1-files, 2-invoices, 3-quotations, 4-others)'})
  file_type: string;

  @Column({type: 'varchar', width: 255})
  file_url: string;

  @Column({ type: 'int', width: 9 })
  user_id: number;

  @Column({ type: 'int', width: 9, nullable: true })
  project_id: number;

  @Column({ type: 'int', width: 9, nullable: true })
  order_id: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @ManyToOne(type => Projects)
  @JoinColumn({ name: 'project_id' })
  project: Projects;

  @ManyToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @ManyToOne(type => Orders)
  @JoinColumn({ name: 'order_id' })
  order: Orders;
}
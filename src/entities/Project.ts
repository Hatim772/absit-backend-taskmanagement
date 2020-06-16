import { Column, CreateDateColumn, ManyToOne, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Users } from './Users';
import { OrdersReference } from './OrdersReference';
import { UsersShippingAddress } from './UsersShippingAddress';
import { ProjectFiles } from './ProjectFiles';
@Entity()
export class Projects {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', width: 150 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    address_line1: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    address_line2: string;

    @Column({ type: 'varchar', width: 150 , nullable: true})
    city: string;

    @Column({ type: 'int', width: 9, nullable: true })
    pincode: number;

    @Column({ type: 'int', width: 9 })
    user_id: number;

    @Column({ type: 'int', width: 9, nullable: true })
    shipping_id: number;

    @Column({ type: 'varchar', width: 150, nullable: true })
    owner: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    property_type: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    layout: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    area: string;

    @ManyToOne(type => Users)
    @JoinColumn({ name: 'user_id' })
    user: Users

    @ManyToOne(type => UsersShippingAddress)
    @JoinColumn({ name: 'shipping_id' })
    shipping_address: Users

    @OneToMany(type => OrdersReference, orderRef => orderRef.project)
    orderRef: OrdersReference[];

    @OneToMany(type => ProjectFiles, projectFiles => projectFiles.project)
    projectFiles: ProjectFiles[];

    @CreateDateColumn()
    createdDate: Date;

    @UpdateDateColumn()
    updatedDate: Date;
}
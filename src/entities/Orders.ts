import { Column, CreateDateColumn, ManyToOne, JoinColumn, Entity, PrimaryGeneratedColumn, OneToOne, Generated, OneToMany, UpdateDateColumn, BeforeInsert } from 'typeorm';
import { OrderShippingAddress } from './OrderShippingAddress';
import { OrdersReference } from './OrdersReference';
import { OrderBillingAddress } from './OrderBillingAddress';
import { ProjectFiles } from './ProjectFiles';
import { OrderTransactions } from './OrderTransactions';

@Entity()
export class Orders {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true})
    // @Generated("uuid")
    order_uuid: string;

    @Column({ type: 'int', width: 11, default: 0 })
    quantity: number;

    @Column({ type: 'varchar', length: 150, nullable: true })
    unit: string;

    @Column({ type: 'text', nullable: true })
    special_instructions: string;

    @Column({ type: 'int', width: 11, nullable: true })
    quotationAmount: number;

    @Column({ type: 'int', width: 11 })
    order_ref_id: number;

    @Column({ type: 'int', width: 11, nullable: true })
    order_shipping_id: number;

    @Column({ type: 'enum', enum: ['1', '2', '3', '4', '5'], comment: '(1-rfp sent, 2-quote received, 3-processing order, 4-order delivered, 5- order cancel)', default: '1' })
    order_status: string;

    @Column({ type: 'varchar', width: 255 })
    eta: string;

    @Column({ type: 'uuid' })
    order_set_id: string;

    @CreateDateColumn()
    createdDate: Date;

    @UpdateDateColumn()
    updatedDate: Date;

    @ManyToOne(type => OrdersReference)
    @JoinColumn({ name: 'order_ref_id' })
    orderRef: OrdersReference;

    @ManyToOne(type => OrderShippingAddress)
    @JoinColumn({ name: 'order_shipping_id' })
    orderShippingAddress: OrderShippingAddress;

    @OneToOne(type => OrderBillingAddress, orderBillingAddress => orderBillingAddress.order)
    orderBillingAddress: OrderBillingAddress;

    @OneToMany(type => ProjectFiles, projectFile => projectFile.order)
    quotationFiles: ProjectFiles[];

    @OneToMany(type => OrderTransactions, orderTransactions => orderTransactions.order)
    orderTransactions: OrderTransactions[];

    @BeforeInsert()
      private beforeInsert() {
        let uuid = 'SKxxxxxx-4xxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        this.order_uuid = uuid;
        // SK290619001
      }
}
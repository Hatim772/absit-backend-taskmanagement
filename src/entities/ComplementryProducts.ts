import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Products } from './Products';
@Entity()
export class ComplementryProducts {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    product_id: number;

    @Column({ type: 'varchar', width: 20 })
    product_sku: string;

    // @ManyToOne(type => Products)
    // @JoinColumn({ name: 'product_sku' })
    // products_sku: Products;

    // @ManyToOne(type => Products)
    // @JoinColumn({ name: 'product_id' })
    // products: Products;
}
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn} from 'typeorm';
import { Moodboard } from './Moodboard';
import { Colors } from './Colors';
import { Products } from './Products';
import { Images } from './Images';
import { Labels } from './Labels';
@Entity()
export class MoodboardItems {
    @PrimaryGeneratedColumn()
    id: number;

	@Column({type: 'int', width: 11, nullable: true})
    color_id: number;

    @Column({type: 'int', width: 11, nullable: true})
    image_id: number;

    @Column({type: 'int', width: 11, nullable: true})
    product_id: number;

    @Column({type: 'int', width: 11})
    moodboard_id: number;

    @Column({type: 'int', width: 11, default: '1' })
    label_id: number;
    
    @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-no, 1-yes)', default: '0'})
    is_favourite: string;

    @ManyToOne(type => Colors)
    @JoinColumn({name: 'color_id'})
    color: Colors;

    @ManyToOne(type => Images)
    @JoinColumn({name: 'image_id'})
    image: Images;
    
    @ManyToOne(type => Products)
    @JoinColumn({name: 'product_id'})
    product: Products;

    @ManyToOne(type => Moodboard, { onDelete: 'CASCADE'})
    @JoinColumn({name: 'moodboard_id'})
    moodboard: Moodboard;

    @ManyToOne(type => Labels)
    @JoinColumn({name: 'label_id'})
    label: Labels;
}
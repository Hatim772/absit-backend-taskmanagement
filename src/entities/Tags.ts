import { Column, CreateDateColumn, OneToMany, Entity, PrimaryGeneratedColumn,} from 'typeorm';
import { ProductTags } from './ProductTags';
import { MoodboardTags } from './MoodboardTags';
@Entity()
export class Tags {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'varchar', width: 255, nullable: false })
	name: string;

	@CreateDateColumn()
	createdDate: Date;

	@OneToMany(type => ProductTags, product_tag => product_tag.tags)
	product_tag: ProductTags[];

	@OneToMany(type => MoodboardTags, moodboard_tag => moodboard_tag.tag)
	moodboard_tag: MoodboardTags[];
}
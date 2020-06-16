import { Column, ManyToOne, JoinColumn, Entity, PrimaryGeneratedColumn} from 'typeorm';
import { Tags } from './Tags';
import { Moodboard } from './Moodboard';
@Entity()
export class MoodboardTags {
	@PrimaryGeneratedColumn()
    id: number;
    
	@Column({ type: 'int', width: 11 })
	moodboard_id: number;

	@Column({ type: 'int', width: 11 })
	tag_id: number;

	@Column({ type: 'int', width: 11, default: 0})
	product_count: number;

	@ManyToOne(type => Tags)
	@JoinColumn({ name: 'tag_id' })
	tag: Tags;

	@ManyToOne(type => Moodboard, {onDelete: 'CASCADE'})
	@JoinColumn({ name: 'moodboard_id' })
	moodboard: Moodboard;
}
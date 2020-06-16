import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn} from 'typeorm';
import { Moodboard } from './Moodboard';
@Entity()
export class MoodboardViews {
    @PrimaryGeneratedColumn()
    id: number;

	@Column({type: 'varchar', width: 20})
    ip: string;

    @Column({type: 'int', width: 11})
    moodboard_id: string;
    
    @ManyToOne(type => Moodboard, { onDelete: 'CASCADE'})
    @JoinColumn({name: 'moodboard_id'})
	moodboard: Moodboard;
}
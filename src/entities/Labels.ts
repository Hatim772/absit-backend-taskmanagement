import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToMany} from 'typeorm';
import { Moodboard } from './Moodboard';
import { Users } from './Users';
import { MoodboardItems } from './MoodboardItems';
@Entity()
export class Labels {
    @PrimaryGeneratedColumn()
    id: number;

	@Column({type: 'varchar', width: 20})
    label: string;

    @Column({type: 'int', width: 11, nullable: true})
    moodboard_id: number;

    @Column({type: 'int', width: 11, nullable: true})
    user_id: number;

    @OneToMany(type => MoodboardItems, item => item.label)
    item: MoodboardItems[];
    
    @ManyToOne(type => Moodboard, { onDelete: 'CASCADE'})
    @JoinColumn({name: 'moodboard_id'})
    moodboard: Moodboard;
    
    @ManyToOne(type => Users, { onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id'})
	user: Users;
}
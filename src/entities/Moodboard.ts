import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, OneToMany, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { Users } from './Users';
import { MoodboardOrders } from './MoodboardOrders';
import { MoodboardViews } from './MoodboardViews';
import { MoodboardItems } from './MoodboardItems';
import { MoodboardTags } from './MoodboardTags';
@Entity()
export class Moodboard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-private, 1-public)', default: '0' })
  status: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-no, 1-yes)', default: '0' })
  is_favourite: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-no, 1-yes)', default: '0' })
  is_trending: string;

  @Column({ type: 'int', width: 11 })
  user_id: number;

  @Column({ type: 'int', width: 11, nullable: true })
  cloned_from: number;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-no, 1-yes)', default: '0' })
  requested_for_public: string;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @ManyToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @OneToMany(type => MoodboardOrders, moodboardOrders => moodboardOrders.moodboard)
  moodboardOrders: MoodboardOrders[];

  @OneToMany(type => MoodboardItems, moodboardItem => moodboardItem.moodboard)
  moodboardItem: MoodboardItems[];

  @OneToMany(type => MoodboardViews, moodboardViews => moodboardViews.moodboard)
  moodboardViews: MoodboardViews[];

  @OneToMany(type => MoodboardTags, moodboardTags => moodboardTags.moodboard)
  moodboardTags: MoodboardTags[];

  @ManyToOne(type => Moodboard, moodboard => moodboard.cloned_moodboard, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cloned_from' })
  cloned_moodboard: Moodboard;
}

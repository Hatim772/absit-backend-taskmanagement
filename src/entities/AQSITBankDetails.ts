import { Column, Entity, PrimaryGeneratedColumn, JoinColumn, OneToOne, ManyToOne, CreateDateColumn, UpdateDateColumn} from 'typeorm';
@Entity()
export class AQSITBankDetails {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 255})
    bank_name: string;

    @Column({ type: 'enum', enum: ['1', '2', '3'], comment: '(1-saving account, 2-current account, 3-instant account)'})
    account_type: string;

    @Column({ type: 'varchar', length: 255 })
    beneficiary_name: string;

    @Column({ type: 'varchar', length: 255})
    account_number: string;

    @Column({ type: 'varchar', length: 255 })
    ifsc_code: string;

    @CreateDateColumn()
    createdDate: Date;
  
    @UpdateDateColumn()
    updatedDate: Date;
}
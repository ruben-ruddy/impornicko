import { Module } from '@nestjs/common';
import { InventoryMovementsController } from './inventory-movements.controller';
import { InventoryMovementsService } from './inventory-movements.service';

@Module({
  controllers: [InventoryMovementsController],
  providers: [InventoryMovementsService]
})
export class InventoryMovementsModule {}

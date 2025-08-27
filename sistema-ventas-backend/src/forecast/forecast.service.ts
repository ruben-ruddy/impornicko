// src/forecast/forecast.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForecastRequestDto } from './dto/forecast-request.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { ForecastResult, HistoricalData, TopProduct, TopSellingDate } from './interfaces/forecast.interface';
import { TopDatesQueryDto } from './dto/top-dates-query.dto';

@Injectable()
export class ForecastService {
  constructor(private prisma: PrismaService) {}

  async getSalesHistory(query: HistoryQueryDto): Promise<HistoricalData[]> {
    const { fecha_inicio, fecha_fin, periodo, producto, categoria } = query;
    
    // Construir consulta base
    let whereClause: any = {
      fecha_venta: {
        gte: new Date(fecha_inicio),
        lte: new Date(fecha_fin),
      },
      estado: 'completada', // Solo ventas completadas
    };

    // Filtrar por producto si se especifica
    if (producto) {
      whereClause.detalle_ventas = {
        some: {
          id_producto: producto,
        },
      };
    }

    // Agrupar ventas por período
    const sales = await this.prisma.sale.findMany({
      where: whereClause,
      include: {
        detalle_ventas: {
          include: {
            producto: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        fecha_venta: 'asc',
      },
    });

    // Procesar y agrupar datos según el período
    return this.processHistoricalData(sales, periodo, categoria);
  }

  private processHistoricalData(sales: any[], periodo: string, categoria?: string): HistoricalData[] {
    const groupedData: { [key: string]: number } = {};

    sales.forEach(sale => {
      sale.detalle_ventas.forEach(detalle => {
        // Filtrar por categoría si se especifica
        if (categoria && detalle.producto?.category?.id_categoria !== categoria) {
          return;
        }

        const fechaKey = this.getDateKey(sale.fecha_venta, periodo);

        // === CORRECCIÓN AQUÍ ===
        // Usar ?. para evitar errores si subtotal es null o undefined
        // Usar ?? para proporcionar un valor predeterminado (0) si la conversión falla
        const ventaActual = detalle.subtotal?.toNumber() ?? 0;
        groupedData[fechaKey] = (groupedData[fechaKey] || 0) + ventaActual;
      });
    });

    // Convertir a array y ordenar
    return Object.entries(groupedData)
      .map(([fecha, ventas]) => ({ fecha, ventas }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private getDateKey(date: Date, periodo: string): string {
    const d = new Date(date);
    
    switch (periodo) {
      case 'diario':
        return d.toISOString().split('T')[0]; // YYYY-MM-DD
      case 'semanal':
        const year = d.getFullYear();
        const week = this.getWeekNumber(d);
        return `${year}-W${week.toString().padStart(2, '0')}`;
      case 'mensual':
        return d.toISOString().substring(0, 7); // YYYY-MM
      default:
        return d.toISOString().split('T')[0];
    }
  }
  
  private getWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  }

  async generateForecast(forecastRequest: ForecastRequestDto): Promise<ForecastResult[]> {
    const { metodo, periodo, fecha_inicio, fecha_fin, parametros } = forecastRequest;

    // Obtener datos históricos
    const historicalData = await this.getSalesHistory({
      fecha_inicio,
      fecha_fin,
      periodo,
    });

    if (historicalData.length === 0) {
      throw new NotFoundException('No hay datos históricos para el período seleccionado');
    }

    // Extraer solo los valores de ventas
    const salesValues = historicalData.map(item => item.ventas);

    // Generar pronóstico según el método
    switch (metodo) {
      case 'lineal':
        return this.linearRegressionForecast(salesValues, parametros?.periodos || 6, periodo);
      
      case 'promedio_movil':
        return this.movingAverageForecast(salesValues, parametros?.periodos || 6, parametros?.alpha || 0.3);
      
      case 'estacional':
        return this.seasonalForecast(salesValues, parametros?.periodos || 6, parametros?.estacionalidad || 12);
      
      default:
        throw new NotFoundException('Método de pronóstico no válido');
    }
  }

  private linearRegressionForecast(data: number[], periods: number, periodo: string): ForecastResult[] {
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = data.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, val, idx) => sum + val * data[idx], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const results: ForecastResult[] = [];
    const lastDate = new Date();
    
    for (let i = 1; i <= periods; i++) {
      const prediction = intercept + slope * (n + i);
      const confidenceInterval = this.calculateConfidenceInterval(prediction, data);
      
      results.push({
        fecha: this.getFutureDate(lastDate, i, periodo),
        ventas_previstas: prediction,
        intervalo_confianza: confidenceInterval,
        metrica_precision: this.calculatePrecision(data, prediction)
      });
    }
    
    return results;
  }

  private movingAverageForecast(data: number[], periods: number, alpha: number): ForecastResult[] {
    const results: ForecastResult[] = [];
    const forecastData = [...data];
    const lastDate = new Date();

    for (let i = 0; i < periods; i++) {
      const window = forecastData.slice(-3); // Últimos 3 períodos
      const prediction = window.reduce((sum, val) => sum + val, 0) / window.length;
      
      // Suavizado exponencial
      const smoothedPrediction = alpha * prediction + (1 - alpha) * (forecastData[forecastData.length - 1] || prediction);
      
      const confidenceInterval = this.calculateConfidenceInterval(smoothedPrediction, data);
      
      results.push({
        fecha: this.getFutureDate(lastDate, i + 1, 'mensual'), // Ajustar según período
        ventas_previstas: smoothedPrediction,
        intervalo_confianza: confidenceInterval,
        metrica_precision: this.calculatePrecision(data, smoothedPrediction)
      });

      forecastData.push(smoothedPrediction);
    }

    return results;
  }

  private seasonalForecast(data: number[], periods: number, seasonality: number): ForecastResult[] {
    // Implementación básica de estacionalidad
    const seasonalFactors = this.calculateSeasonalFactors(data, seasonality);
    const results: ForecastResult[] = [];
    const lastDate = new Date();

    for (let i = 1; i <= periods; i++) {
      const baseIndex = data.length % seasonality;
      const seasonalIndex = (baseIndex + i - 1) % seasonality;
      const baseValue = data.slice(-seasonality).reduce((a, b) => a + b, 0) / seasonality;
      
      const prediction = baseValue * seasonalFactors[seasonalIndex];
      const confidenceInterval = this.calculateConfidenceInterval(prediction, data);

      results.push({
        fecha: this.getFutureDate(lastDate, i, 'mensual'),
        ventas_previstas: prediction,
        intervalo_confianza: confidenceInterval,
        metrica_precision: this.calculatePrecision(data, prediction)
      });
    }

    return results;
  }

  private calculateSeasonalFactors(data: number[], seasonality: number): number[] {
  const factors: number[] = Array(seasonality).fill(1);
  
  if (data.length >= seasonality * 2) {
    for (let i = 0; i < seasonality; i++) {
      const seasonalValues: number[] = []; // ← Especificar tipo explícitamente
      
      for (let j = i; j < data.length; j += seasonality) {
        if (j < data.length) {
          seasonalValues.push(data[j]); // ← Ahora funciona
        }
      }
      
      if (seasonalValues.length > 0) {
        factors[i] = seasonalValues.reduce((a, b) => a + b, 0) / seasonalValues.length;
      }
    }
    
    const avgFactor = factors.reduce((a, b) => a + b, 0) / seasonality;
    return factors.map(f => f / avgFactor);
  }
  
  return factors;
}

  private calculateConfidenceInterval(prediction: number, historicalData: number[]) {
    const stdDev = this.calculateStandardDeviation(historicalData);
    const marginOfError = 1.96 * stdDev; // 95% confidence interval
    
    return {
      inferior: Math.max(0, prediction - marginOfError),
      superior: prediction + marginOfError
    };
  }

  private calculateStandardDeviation(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const squaredDiffs = data.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(variance);
  }

  private calculatePrecision(historicalData: number[], prediction: number): number {
    if (historicalData.length === 0) return 0;
    
    const lastValue = historicalData[historicalData.length - 1];
    const error = Math.abs(prediction - lastValue) / lastValue;
    return Math.max(0, 100 - (error * 100));
  }

  private getFutureDate(baseDate: Date, offset: number, periodo: string): string {
    const date = new Date(baseDate);
    
    switch (periodo) {
      case 'diario':
        date.setDate(date.getDate() + offset);
        break;
      case 'semanal':
        date.setDate(date.getDate() + (offset * 7));
        break;
      case 'mensual':
        date.setMonth(date.getMonth() + offset);
        break;
    }
    
    return date.toISOString().split('T')[0];
  }

async getTopSellingDates(query: TopDatesQueryDto): Promise<any[]> {
  console.log('Query recibida:', query);
  const { fecha_inicio, fecha_fin, periodo, limit = 10 } = query;
  
  try {
    // Convertir y validar fechas
    console.log('Convirtiendo fechas...');
    const startDate = new Date(fecha_inicio);
    const endDate = new Date(fecha_fin);
    console.log('Fechas convertidas:', startDate, endDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Fechas inválidas');
    }

    // Obtener ventas en el período especificado
    const sales = await this.prisma.sale.findMany({
      where: {
        fecha_venta: {
          gte: startDate,
          lte: endDate,
        },
        estado: 'completada',
      },
      include: {
        detalle_ventas: {
          include: {
            producto: true,
          },
        },
      },
      orderBy: {
        fecha_venta: 'asc',
      },
    });

    if (sales.length === 0) {
      return []; // Retornar array vacío en lugar de error
    }

    // Agrupar ventas por fecha según el período
    const groupedSales = this.groupSalesByPeriod(sales, periodo);

    // Ordenar por total de ventas (descendente) y tomar el límite
    return groupedSales
      .sort((a, b) => b.total_ventas - a.total_ventas)
      .slice(0, limit);
  } catch (error) {
    console.error('Error detallado:', error);
    console.error('Error en getTopSellingDates:', error);
    throw new Error(`Error al obtener fechas con mayores ventas: ${error.message}`);
  }
}
async getTopProductsByDate(date: string, limit: number = 10): Promise<any[]> {
  try {
    console.log('📦 Buscando productos para fecha:', date);

    // Determinar el tipo de fecha y crear el rango
    let startDate: Date;
    let endDate: Date;

    if (date.includes('W')) {
      // Formato semanal: YYYY-WXX
      [startDate, endDate] = this.getWeekRangeFromString(date);
    } else if (date.length === 7 && date[4] === '-') {
      // Formato mensual: YYYY-MM
      [startDate, endDate] = this.getMonthRangeFromString(date);
    } else if (date.length === 10 && date[4] === '-' && date[7] === '-') {
      // Formato diario: YYYY-MM-DD
      startDate = new Date(date + 'T00:00:00');
      endDate = new Date(date + 'T00:00:00');
      endDate.setDate(endDate.getDate() + 1);
    } else {
      // Intentar parsear como fecha completa
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        throw new Error(`Formato de fecha no reconocido: ${date}`);
      }
      startDate = new Date(parsedDate);
      endDate = new Date(parsedDate);
      endDate.setDate(endDate.getDate() + 1);
    }

    console.log('📅 Rango de fechas:', startDate.toISOString(), 'a', endDate.toISOString());

    // Obtener ventas del período específico
    const sales = await this.prisma.sale.findMany({
      where: {
        fecha_venta: {
          gte: startDate,
          lt: endDate,
        },
        estado: 'completada',
      },
      include: {
        detalle_ventas: {
          include: {
            producto: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    console.log('🛒 Ventas encontradas:', sales.length);

    if (sales.length === 0) {
      return []; // Retornar array vacío
    }

    // Agrupar productos
    const productMap = new Map();
    let totalVentasPeriodo = 0;

    sales.forEach(sale => {
      sale.detalle_ventas.forEach(detalle => {
        const productId = detalle.producto.id_producto;
        const subtotalValue = detalle.subtotal ? detalle.subtotal.toNumber() : 0;
        totalVentasPeriodo += subtotalValue;

        if (productMap.has(productId)) {
          const existing = productMap.get(productId);
          existing.cantidad_vendida += detalle.cantidad;
          existing.ingresos_totales += subtotalValue;
        } else {
          productMap.set(productId, {
            producto_id: productId,
            producto_nombre: detalle.producto.nombre_producto,
            categoria: detalle.producto.category?.nombre_categoria || 'Sin categoría',
            cantidad_vendida: detalle.cantidad,
            ingresos_totales: subtotalValue,
          });
        }
      });
    });

    // Calcular porcentajes y ordenar
    const products = Array.from(productMap.values()).map(product => ({
      ...product,
      porcentaje_del_total: totalVentasPeriodo > 0 
        ? (product.ingresos_totales / totalVentasPeriodo) * 100 
        : 0,
    }));

    return products
      .sort((a, b) => b.ingresos_totales - a.ingresos_totales)
      .slice(0, limit);

  } catch (error) {
    console.error('❌ Error en getTopProductsByDate:', error);
    throw new Error(`Error al obtener productos: ${error.message}`);
  }
}

private getWeekRangeFromString(weekString: string): [Date, Date] {
  try {
    // Formato: YYYY-WXX
    const [year, week] = weekString.split('-W');
    const yearNum = parseInt(year);
    const weekNum = parseInt(week);
    
    if (isNaN(yearNum) || isNaN(weekNum) || weekNum < 1 || weekNum > 53) {
      throw new Error('Formato de semana inválido');
    }

    // Primer día del año
    const firstDayOfYear = new Date(yearNum, 0, 1);
    
    // Días para agregar: (semana - 1) * 7 + ajuste por día de la semana
    const daysToAdd = (weekNum - 1) * 7;
    
    const startDate = new Date(firstDayOfYear);
    startDate.setDate(firstDayOfYear.getDate() + daysToAdd);
    
    // Ajustar al primer día de la semana (lunes)
    const dayOfWeek = startDate.getDay();
    const adjustToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + adjustToMonday);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 7);
    
    return [startDate, endDate];
  } catch (error) {
    console.error('Error parsing week:', error);
    throw new Error(`Formato de semana inválido: ${weekString}`);
  }
}

private getMonthRangeFromString(monthString: string): [Date, Date] {
  try {
    // Formato: YYYY-MM
    const [year, month] = monthString.split('-');
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error('Formato de mes inválido');
    }

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 1);
    
    return [startDate, endDate];
  } catch (error) {
    console.error('Error parsing month:', error);
    throw new Error(`Formato de mes inválido: ${monthString}`);
  }
}

  private groupSalesByPeriod(sales: any[], periodo: string): any[] {
    const groupedData: { [key: string]: { total_ventas: number, cantidad_transacciones: number } } = {};

    sales.forEach(sale => {
      const dateKey = this.getDateKey(sale.fecha_venta, periodo);
      
      if (!groupedData[dateKey]) {
        groupedData[dateKey] = {
          total_ventas: 0,
          cantidad_transacciones: 0,
        };
      }

      // Sumar el total de la venta
      groupedData[dateKey].total_ventas += sale.total.toNumber();
      groupedData[dateKey].cantidad_transacciones += 1;
    });

    // Convertir a array con formato
    return Object.entries(groupedData).map(([fecha, datos]) => ({
      fecha,
      total_ventas: datos.total_ventas,
      cantidad_transacciones: datos.cantidad_transacciones,
    }));
  }
  private parseDateString(dateString: string): { startDate: Date; endDate: Date; type: string } {
  if (dateString.includes('W')) {
    // Formato semanal
    const [start, end] = this.getWeekRangeFromString(dateString);
    return { startDate: start, endDate: end, type: 'semanal' };
  } else if (dateString.length === 7) {
    // Formato mensual
    const [start, end] = this.getMonthRangeFromString(dateString);
    return { startDate: start, endDate: end, type: 'mensual' };
  } else if (dateString.length === 10) {
    // Formato diario
    const startDate = new Date(dateString);
    const endDate = new Date(dateString);
    endDate.setDate(endDate.getDate() + 1);
    return { startDate, endDate, type: 'diario' };
  } else {
    throw new Error(`Formato de fecha no reconocido: ${dateString}`);
  }
}

}

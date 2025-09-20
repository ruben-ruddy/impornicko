// sistema-ventas-frontend/src/app/modules/sales/types.ts

export interface Client {
  id_cliente: string;
  nombre_completo: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  documento_identidad?: string;
  fecha_registro: string;
  activo: boolean;
   // Para uso en selectores
  value?: string;
  label?: string;
}

export interface User {
  id_usuario: string;
  nombre_usuario: string;
  email: string;
  nombre_completo: string;
  telefono?: string;
  activo: boolean;
  fecha_creacion: string;
  ultimo_acceso?: string;
   // Para uso en selectores
  value?: string;
  label?: string;
}

export interface Product {
  id_producto: string;
  id_categoria: string;
  codigo_producto: string;
  nombre_producto: string;
  descripcion?: string;
  precio_venta: number;
  precio_compra: number;
  stock_actual: number;
  stock_minimo: number;
  imagen_url?: string;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  category?: {
    nombre_categoria: string;
  };
}

export interface Sale {
  id_venta: string;
  id_usuario: string;
  id_cliente?: string;
  numero_venta: string;
  fecha_venta: string;
  subtotal: number;
  descuento: number;
  impuesto: number;
  total: number;
  estado: 'pendiente' | 'completada' | 'cancelada';
  observaciones?: string;
  client?: Client;
  user?: User;
  detalle_ventas?: SaleDetail[];
}

export interface SaleDetail {
  id_detalle_venta?: string;
  id_venta?: string;
  id_producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  producto?: Product;
  // Agregar estas propiedades opcionales
  nombre_producto?: string;
  codigo_producto?: string;
  stock_actual?: number;
}
if (!document.querySelector('meta[name=description]')) {
  var md = document.createElement('meta');
  md.name = 'description';
  md.content = 'Plataforma educativa de habilidades blandas para adolescentes de la Fundación Luz de Esperanza: cursos, tareas, foros y evaluaciones en línea.';
  document.head.appendChild(md);
}
// Configuración de la plataforma
window.HB_CONFIG = {
  modo: 'supabase', // 'local' = prueba en este navegador | 'supabase' = base de datos compartida (uso real)
  supabaseUrl: 'https://eiwxmgywalrfyzlbrzda.supabase.co', // Ej.: https://supabase.co
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpd3htZ3l3YWxyZnl6bGJyemRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NzIxNTQsImV4cCI6MjExMTA0ODE1NH0.N8CRhxS1YepceAu8uZvbTq6rgc-6aIDuYu7RDbDd1JY', // Clave "anon public" del proyecto
  contacto: '' // Correo del profesor para recibir solicitudes de cuenta (opcional)
};

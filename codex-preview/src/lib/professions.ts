// Lista compartilhada de profissões/segmentos — usada no cadastro
// (SignupPage) e na edição de perfil (AgentSiteSettings), pra nunca ficar
// duas listas divergindo. Ampla de propósito: cobre quem usaria um site
// pessoal + IA no WhatsApp pra atender cliente, não só corretor de imóveis.
export const PROFESSIONS = [
  // Imóveis e correlatos
  'Corretor(a) de Imóveis',
  'Corretor(a) de Seguros',
  'Despachante',
  // Beleza e estética
  'Cabeleireiro(a)',
  'Barbeiro(a)',
  'Esteticista',
  'Manicure / Nail designer',
  'Maquiador(a)',
  'Depilador(a)',
  'Designer de sobrancelhas / Micropigmentador(a)',
  // Saúde e bem-estar
  'Personal Trainer',
  'Nutricionista',
  'Dentista',
  'Médico(a)',
  'Psicólogo(a)',
  'Fisioterapeuta',
  'Fonoaudiólogo(a)',
  'Massoterapeuta',
  'Terapeuta holístico(a)',
  'Enfermeiro(a)',
  'Veterinário(a)',
  // Direito, contabilidade e consultoria
  'Advogado(a)',
  'Contador(a)',
  'Consultor(a)',
  'Coach',
  // Criativos e eventos
  'Fotógrafo(a)',
  'Videomaker',
  'Designer Gráfico(a)',
  'Arquiteto(a) / Designer de Interiores',
  'Cerimonialista / Organizador(a) de eventos',
  'DJ / Músico(a)',
  'Confeiteiro(a) / Doceiro(a)',
  'Chef particular / Personal chef',
  'Costureira(o) / Estilista',
  // Vendas e automotivo
  'Vendedor(a) Automotivo',
  'Vendedor(a)',
  'Mecânico(a)',
  'Funileiro(a) / Pintor(a) automotivo',
  // Serviços residenciais
  'Eletricista',
  'Encanador(a)',
  'Pedreiro(a) / Reformas',
  'Marceneiro(a)',
  'Jardineiro(a) / Paisagista',
  'Diarista / Faxineiro(a)',
  'Dedetizador(a)',
  'Chaveiro(a)',
  // Educação
  'Professor(a) particular / Tutor(a)',
  // Pets
  'Pet shop / Banho e tosa',
  'Adestrador(a)',
  // Digital
  'Social media / Marketing digital',
  'Desenvolvedor(a) / Programador(a)',
  'Outro',
];

// Única profissão com campo extra (CRECI) — usado no cadastro e no editor
// de perfil pra decidir quando mostrar/exigir esse campo.
export const REAL_ESTATE_PROFESSION = 'Corretor(a) de Imóveis';
